import { supabase } from "./supabase";

function isDuplicateInsertError(err: {
  code?: string | number;
  message?: string;
}): boolean {
  const c = String(err.code ?? "");
  if (c === "23505") return true;
  const m = (err.message ?? "").toLowerCase();
  return m.includes("duplicate key") || m.includes("unique constraint");
}

function isOnboardingVariantColumnMissing(err: {
  code?: string | number;
  message?: string;
}): boolean {
  const c = String(err.code ?? "");
  if (c === "42703") return /\bonboarding_variant\b/i.test(err.message ?? "");
  const m = (err.message ?? "").toLowerCase();
  return /onboarding_variant/.test(err.message ?? "") && /could not find|does not exist|undefined column/i.test(m);
}

function missingColumnName(err: {
  code?: string | number;
  message?: string;
}): string | null {
  const c = String(err.code ?? "");
  const msg = String(err.message ?? "");
  if (c !== "42703" && !/does not exist|undefined column|could not find/i.test(msg.toLowerCase())) return null;
  const m = msg.match(/column\s+["']?([a-zA-Z0-9_]+)["']?/i);
  return m?.[1] ?? null;
}

/**
 * Garantit une ligne `profiles` avec id = `authUserId` (toujours l’UUID Supabase Auth).
 * Ne génère jamais d’UUID aléatoire : `profiles.id` doit rester égal à `auth.users.id`.
 * Appeler après signup et lorsque le SELECT profil ne retourne aucune ligne.
 *
 * Une fois la ligne existe : aucun nouvel INSERT ; mise à jour optionnelle uniquement pour
 * `onboarding_variant` NULL (cohorte A/B). Les creations concurrentes utilisent un upsert
 * `IGNORE DUPLICATES` pour ne pas réécraser les champs métier après OAuth / trigger DB.
 */
export async function ensureProfileRowForAuthUserId(authUserId: string): Promise<boolean> {
  if (!authUserId) return false;

  async function fetchExisting(): Promise<{ id?: string; onboarding_variant?: string | null } | null> {
    let res = await supabase
      .from("profiles")
      .select("id, onboarding_variant")
      .eq("id", authUserId)
      .maybeSingle();
    if (res.error && isOnboardingVariantColumnMissing(res.error)) {
      res = await supabase.from("profiles").select("id").eq("id", authUserId).maybeSingle();
    }
    if (res.error) {
      console.warn("[ensureProfileRowForAuthUserId] profile existence check failed", res.error);
      return null;
    }
    return res.data;
  }

  const existingProfile = await fetchExisting();

  /** Profil déjà présent → jamais d’INSERT / upsert remplaçant la ligne ; backfill cohorte seulement. */
  if (existingProfile?.id) {
    const { error: assignErr } = await supabase
      .from("profiles")
      .update({ onboarding_variant: Math.random() < 0.5 ? "A" : "B" })
      .eq("id", authUserId)
      .is("onboarding_variant", null);
    if (assignErr && !isOnboardingVariantColumnMissing(assignErr)) {
      console.warn("[ensureProfileRowForAuthUserId] onboarding_variant backfill skipped", {
        code: assignErr.code,
        message: assignErr.message,
      });
    }
    return true;
  }

  const variant = Math.random() < 0.5 ? "A" : "B";
  const basePayload: Record<string, unknown> = {
    id: authUserId,
    profile_completed: false,
    onboarding_completed: false,
    onboarding_done: false,
    onboarding_variant: variant,
  };

  /** INSERT si absent ; ON CONFLICT DO NOTHING si une autre transaction a déjà créé la ligne (trigger / OAuth). */
  const tryUpsertIdempotentInsert = async (): Promise<boolean> => {
    const payload: Record<string, unknown> = { ...basePayload };
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase.from("profiles").upsert(payload, {
        onConflict: "id",
        ignoreDuplicates: true,
      });
      if (!error) return true;
      if (isDuplicateInsertError(error)) return true;
      const col = missingColumnName(error);
      if (!col || !(col in payload)) return false;
      delete payload[col];
    }
    return false;
  };

  const ok = await tryUpsertIdempotentInsert();
  if (!ok) return false;

  const { error: assignErr } = await supabase
    .from("profiles")
    .update({ onboarding_variant: variant })
    .eq("id", authUserId)
    .is("onboarding_variant", null);

  if (assignErr && !isOnboardingVariantColumnMissing(assignErr)) {
    console.warn("[ensureProfileRowForAuthUserId] onboarding_variant backfill skipped", {
      code: assignErr.code,
      message: assignErr.message,
    });
  }
  return true;
}
