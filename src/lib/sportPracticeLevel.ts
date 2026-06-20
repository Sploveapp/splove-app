export const SPORT_PRACTICE_LEVELS = ["beginner", "intermediate", "confirmed", "expert"] as const;

export type SportPracticeLevel = (typeof SPORT_PRACTICE_LEVELS)[number];

const LEVEL_FILLED_COUNT: Record<SportPracticeLevel, number> = {
  beginner: 1,
  intermediate: 3,
  confirmed: 4,
  expert: 5,
};

const LEGACY_LEVEL_MAP: Record<string, SportPracticeLevel> = {
  regular: "intermediate",
  debutant: "beginner",
  débutant: "beginner",
  intermediaire: "intermediate",
  intermédiaire: "intermediate",
  confirme: "confirmed",
  confirmé: "confirmed",
  expert: "expert",
};

export function isSportPracticeLevel(value: string): value is SportPracticeLevel {
  return (SPORT_PRACTICE_LEVELS as readonly string[]).includes(value);
}

export function normalizeSportPracticeLevel(raw: string | null | undefined): SportPracticeLevel | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (isSportPracticeLevel(v)) return v;
  return LEGACY_LEVEL_MAP[v] ?? null;
}

export function sportPracticeLevelI18nKey(level: SportPracticeLevel): string {
  return `sport_practice_level_${level}`;
}

export function sportPracticeLevelFilledCount(level: SportPracticeLevel | null | undefined): number {
  if (!level) return 0;
  return LEVEL_FILLED_COUNT[level];
}

export function hasValidSportPracticeLevel(raw: string | null | undefined): boolean {
  return normalizeSportPracticeLevel(raw) != null;
}

/** Cinq points visuels (● rempli, ○ vide) — sans texte ni pourcentage. */
export function sportPracticeLevelDots(raw: string | null | undefined): string {
  const level = normalizeSportPracticeLevel(raw);
  const filled = sportPracticeLevelFilledCount(level);
  return "●".repeat(filled) + "○".repeat(5 - filled);
}
