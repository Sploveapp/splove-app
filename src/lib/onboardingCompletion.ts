import type { SupabaseClient } from "@supabase/supabase-js";
import { selectProfilesFirstMatch } from "./profileSelect";
import { OnboardingFlowLog } from "./onboardingFlowLog";

const ONBOARDING_COMPLETION_SELECT_TIERS = [
  "id, profile_completed, onboarding_completed, onboarding_done, accepted_terms_at, accepted_privacy_at, first_name, birth_date, gender, looking_for, portrait_url, fullbody_url, main_photo_url, onboarding_sports_count",
  "id, profile_completed, onboarding_completed, onboarding_done, accepted_terms_at, accepted_privacy_at, first_name, birth_date, gender, looking_for, portrait_url, fullbody_url, main_photo_url",
  "id, profile_completed, onboarding_completed, onboarding_done, accepted_terms_at, accepted_privacy_at, first_name",
];

export type OnboardingCompletionWriteResult = {
  row: Record<string, unknown> | null;
  error: { message?: string } | null;
};

/** Écriture dédiée des drapeaux finaux — indépendante des retries upsert du gros payload. */
export async function ensureOnboardingCompletionInProfile(
  client: SupabaseClient,
  userId: string,
  termsAcceptedAt: string,
  source: string,
): Promise<OnboardingCompletionWriteResult> {
  const payload: Record<string, unknown> = {
    id: userId,
    updated_at: new Date().toISOString(),
    profile_completed: true,
    onboarding_completed: true,
    onboarding_done: true,
    accepted_terms_at: termsAcceptedAt,
    accepted_privacy_at: termsAcceptedAt,
  };

  OnboardingFlowLog.finalSubmitPayload({ id: userId, ...payload, onboarding_step: "completed" });

  const { data, error } = await client
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select(
      "id, profile_completed, onboarding_completed, onboarding_done, accepted_terms_at, accepted_privacy_at",
    )
    .maybeSingle();

  if (error) {
    OnboardingFlowLog.finalSubmitSaved({
      userId,
      source,
      error: error.message,
    });
    return { row: null, error };
  }

  const row = (data ?? { id: userId, ...payload }) as Record<string, unknown>;
  OnboardingFlowLog.finalSubmitSaved({ userId, source, row });
  return { row, error: null };
}

/** Relecture Supabase post-submit (flags + champs garde navigation). */
export async function fetchProfileAfterOnboardingSubmit(
  client: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, lastError } = await selectProfilesFirstMatch(
    client,
    userId,
    ONBOARDING_COMPLETION_SELECT_TIERS,
    "[onboarding-completion-reload]",
  );
  OnboardingFlowLog.profileAfterSubmit({
    userId,
    source: "fetchProfileAfterOnboardingSubmit",
    row: data,
    error: lastError?.message ?? null,
  });
  return data;
}

/** Fusionne un patch partiel sans effacer les drapeaux de complétion déjà connus. */
export function mergeProfileRowPreservingCompletion(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base, ...patch };
  for (const key of [
    "profile_completed",
    "onboarding_completed",
    "onboarding_done",
    "accepted_terms_at",
    "accepted_privacy_at",
  ] as const) {
    const fromPatch = patch[key];
    const fromBase = base[key];
    const patchEmpty = fromPatch !== true && (fromPatch == null || fromPatch === false);
    const baseTruthy =
      fromBase === true ||
      (typeof fromBase === "string" && fromBase.trim().length > 0);
    if (patchEmpty && baseTruthy) merged[key] = fromBase;
  }
  return merged;
}

export function profileRowOnboardingComplete(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  return (
    row.profile_completed === true ||
    row.onboarding_completed === true ||
    row.onboarding_done === true
  );
}
