/**
 * Score de compatibilité « manière de pratiquer » (Discover ranking uniquement, jamais d’exclusion).
 * Couples (viewer, candidat) — symétrique.
 */

import { parseSportPracticePace, type SportPracticePace } from "./sportPracticePace";

/** Très bon : flexible↔flexible, adapted↔flexible */
export const PRACTICE_SCORE_VERY_HIGH = 22;
/** Bon : adapted↔adapted, solo↔solo, solo↔flexible */
export const PRACTICE_SCORE_GOOD = 16;
/** Faible : solo↔adapted, ou valeur manquée / invalide */
export const PRACTICE_SCORE_LOW = 7;

export function practiceCompatibilityScore(
  viewerRaw: string | null | undefined,
  candidateRaw: string | null | undefined,
): number {
  const v = parseSportPracticePace(viewerRaw);
  const c = parseSportPracticePace(candidateRaw);
  if (!v || !c) return PRACTICE_SCORE_LOW;

  return practiceCompatibilityScoreParsed(v, c);
}

export function practiceCompatibilityScoreParsed(viewer: SportPracticePace, candidate: SportPracticePace): number {
  if (viewer === "flexible" && candidate === "flexible") return PRACTICE_SCORE_VERY_HIGH;

  const pair = new Set<SportPracticePace>([viewer, candidate]);
  if (pair.has("adapted") && pair.has("flexible")) return PRACTICE_SCORE_VERY_HIGH;
  if (viewer === "adapted" && candidate === "adapted") return PRACTICE_SCORE_GOOD;
  if (viewer === "solo" && candidate === "solo") return PRACTICE_SCORE_GOOD;
  if (pair.has("solo") && pair.has("flexible")) return PRACTICE_SCORE_GOOD;

  return PRACTICE_SCORE_LOW;
}
