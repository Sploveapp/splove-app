import {
  PRACTICE_SCORE_GOOD,
  PRACTICE_SCORE_VERY_HIGH,
  practiceCompatibilityScore,
} from "../sportPracticeCompatibilityScore";

/** Niveau de confiance Coach — règles déterministes, données profil uniquement. */
export type CoachCompatibilityLevel = "strong" | "good" | "customize";

export type CoachCompatibilityInput = {
  sharedSportsCount: number;
  hasSuggestedSlot: boolean;
  viewerPracticeType?: string | null;
  partnerPracticeType?: string | null;
  distanceKm?: number | null;
};

export type CoachCompatibilityResult = {
  level: CoachCompatibilityLevel;
  /** Score interne v1 — utile pour tests / debug. TODO(v2-ai): enrichir le signal. */
  score: number;
};

/**
 * Évalue la compatibilité de la proposition Coach à partir des signaux déjà en mémoire :
 * sports communs, créneaux communs, manière de pratiquer, distance estimée.
 */
export function computeCoachCompatibility(input: CoachCompatibilityInput): CoachCompatibilityResult {
  const practiceScore = practiceCompatibilityScore(
    input.viewerPracticeType,
    input.partnerPracticeType,
  );

  let score = 0;

  if (input.sharedSportsCount >= 2) score += 3;
  else if (input.sharedSportsCount === 1) score += 2;

  if (input.hasSuggestedSlot) score += 2;

  if (practiceScore >= PRACTICE_SCORE_VERY_HIGH) score += 2;
  else if (practiceScore >= PRACTICE_SCORE_GOOD) score += 1;

  const distance = input.distanceKm;
  if (distance != null && Number.isFinite(distance)) {
    if (distance <= 20) score += 2;
    else if (distance <= 40) score += 1;
    else if (distance > 60) score -= 1;
  }

  let level: CoachCompatibilityLevel = "customize";
  if (score >= 6) level = "strong";
  else if (score >= 3) level = "good";

  return { level, score };
}

export { practiceCompatibilityScore };
