/**
 * Affichage Discover : rythme / mode de pratique (`profiles.sport_practice_type`).
 * Valeurs attendues : solo | adapted | flexible (insensible à la casse).
 */

export type SportPracticePace = "solo" | "adapted" | "flexible";

export function parseSportPracticePace(raw: string | null | undefined): SportPracticePace | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "solo" || s === "adapted" || s === "flexible") return s;
  return null;
}

/** Clé i18n sous `discover.*` ; `null` = ne pas afficher (solo par défaut). */
export function sportPracticePaceI18nKey(pace: SportPracticePace | null): string | null {
  if (pace === "adapted") return "discover.profileCard_practicePace_adapted";
  if (pace === "flexible") return "discover.profileCard_practicePace_flexible";
  return null;
}
