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
 * `onboarding_variant` est fixé uniquement à la première création de ligne (insert) ;
 * en cas de profil déjà existant ou de colonne absente en prod, on ne l’écrit pas via upsert.
 */
export async function ensureProfileRowForAuthUserId(authUserId: string): Promise<boolean> {
  if (!authUserId) return false;

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("onboarding_variant")
    .eq("id", authUserId)
    .maybeSingle();

  let variant = existingProfile?.onboarding_variant;
  if (!variant) {
    variant = Math.random() < 0.5 ? "A" : "B";
  }

  const basePayload: Record<string, unknown> = {
    id: authUserId,
    profile_completed: false,
    onboarding_completed: false,
    onboarding_done: false,
    onboarding_variant: variant,
  };

  const tryInsertWithFallback = async (): Promise<{ ok: boolean; duplicate: boolean }> => {
    const payload: Record<string, unknown> = { ...basePayload };
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase.from("profiles").insert(payload);
      if (!error) return { ok: true, duplicate: false };
      if (isDuplicateInsertError(error)) return { ok: false, duplicate: true };
      const col = missingColumnName(error);
      if (!col || !(col in payload)) break;
      delete payload[col];
    }
    return { ok: false, duplicate: false };
  };

  const insertResult = await tryInsertWithFallback();
  if (insertResult.ok) return true;

  if (insertResult.duplicate) {
    const upsertPayload: Record<string, unknown> = {
      id: authUserId,
      profile_completed: false,
      onboarding_completed: false,
      onboarding_done: false,
    };
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error: upsertError } = await supabase.from("profiles").upsert(upsertPayload, { onConflict: "id" });
      if (!upsertError) break;
      const col = missingColumnName(upsertError);
      if (!col || !(col in upsertPayload)) return false;
      delete upsertPayload[col];
      if (attempt === 4) return false;
    }
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

  const fallbackPayload: Record<string, unknown> = {
    id: authUserId,
    profile_completed: false,
    onboarding_completed: false,
    onboarding_done: false,
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase.from("profiles").upsert(fallbackPayload, { onConflict: "id" });
    if (!error) return true;
    const col = missingColumnName(error);
    if (!col || !(col in fallbackPayload)) return false;
    delete fallbackPayload[col];
  }
  return false;
}
