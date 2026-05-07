/** Valeurs `profiles.intent` — alignées onboarding. */
export const PROFILE_INTENT_AMICAL = "Amical" as const;
export const PROFILE_INTENT_AMOUR = "Amoureux" as const;

export type ProfileIntentValue = typeof PROFILE_INTENT_AMICAL | typeof PROFILE_INTENT_AMOUR;

export type NormalizedIntent = "love" | "friends" | "both" | "open";

export function parseProfileIntent(value: unknown): ProfileIntentValue | null {
  if (value === PROFILE_INTENT_AMICAL || value === PROFILE_INTENT_AMOUR) return value;
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  if (t === PROFILE_INTENT_AMICAL.toLowerCase()) return PROFILE_INTENT_AMICAL;
  if (t === PROFILE_INTENT_AMOUR.toLowerCase()) return PROFILE_INTENT_AMOUR;
  return null;
}

function normalizeToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9_, -]+/g, "");
}

/**
 * Normalisation Intent (beta) :
 * - love | friends | both | open
 * - legacy: "Amoureux" -> love, "amitié" -> friends
 */
export function normalizeIntent(value: unknown): NormalizedIntent | null {
  if (typeof value !== "string") return null;
  const t = normalizeToken(value);
  if (!t) return null;

  if (["amoureux", "love", "dating", "romance"].includes(t)) return "love";
  if (["amical", "amitie", "amitie sportive", "friends", "friendship"].includes(t)) return "friends";
  if (["both", "les deux", "lesdeux", "mixte"].includes(t) || t.includes("lesdeux")) return "both";
  if (["open", "ouvert", "ouverte", "ouvert(e)"].includes(t)) return "open";
  return null;
}

/** Match « amical » : les deux profils ont l’intention Amical (BDD). */
export function isFriendshipIntentPair(intentA: unknown, intentB: unknown): boolean {
  return (
    parseProfileIntent(intentA) === PROFILE_INTENT_AMICAL &&
    parseProfileIntent(intentB) === PROFILE_INTENT_AMICAL
  );
}
