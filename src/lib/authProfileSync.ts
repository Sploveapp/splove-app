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

  // ligne 33 → 43 (remplacement complet)

// 1. récupérer variante existante
const { data: existingProfile } = await supabase
.from("profiles")
.select("onboarding_variant")
.eq("id", authUserId)
.maybeSingle();

// 2. ne générer QUE si absent
let variant = existingProfile?.onboarding_variant;

if (!variant) {
variant = Math.random() < 0.5 ? "A" : "B";
}

  const { error: insertError } = await supabase.from("profiles").insert({
    id: authUserId,
    profile_completed: false,
    onboarding_variant: variant,
  });

  if (!insertError) return true;

  if (isDuplicateInsertError(insertError)) {
    const { error: upsertError } = await supabase.from("profiles").upsert(
      { id: authUserId, profile_completed: false },
      { onConflict: "id" },
    );
    if (upsertError) return false;
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

  if (isOnboardingVariantColumnMissing(insertError)) {
    const { error } = await supabase.from("profiles").upsert(
      { id: authUserId, profile_completed: false },
      { onConflict: "id" },
    );
    return !error;
  }

  console.warn("[ensureProfileRowForAuthUserId] insert failed, falling back to upsert without variant", {
    code: insertError.code,
    message: insertError.message,
  });
  const { error } = await supabase.from("profiles").upsert(
    { id: authUserId, profile_completed: false },
    { onConflict: "id" },
  );
  return !error;
}
