/** Valeurs `profiles.intent` — alignées onboarding. */
export const PROFILE_INTENT_AMICAL = "Amical" as const;
export const PROFILE_INTENT_AMOUR = "Amoureux" as const;

export type ProfileIntentValue = typeof PROFILE_INTENT_AMICAL | typeof PROFILE_INTENT_AMOUR;

export function parseProfileIntent(value: unknown): ProfileIntentValue | null {
  if (value === PROFILE_INTENT_AMICAL || value === PROFILE_INTENT_AMOUR) return value;
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  if (t === PROFILE_INTENT_AMICAL.toLowerCase()) return PROFILE_INTENT_AMICAL;
  if (t === PROFILE_INTENT_AMOUR.toLowerCase()) return PROFILE_INTENT_AMOUR;
  return null;
}

/** Match « amical » : les deux profils ont l’intention Amical (BDD). */
export function isFriendshipIntentPair(intentA: unknown, intentB: unknown): boolean {
  return (
    parseProfileIntent(intentA) === PROFILE_INTENT_AMICAL &&
    parseProfileIntent(intentB) === PROFILE_INTENT_AMICAL
  );
}
