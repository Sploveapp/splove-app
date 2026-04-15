/**
 * Constantes globales SPLove
 */

export const APP_NAME = "SPLove";

/** Window event to refresh the Messages tab badge after reads or realtime updates. */
export const INBOX_REFRESH_EVENT = "splove:inbox-refresh";

/** Options du prompt "Le sport me fait me sentir..." */
export const SPORT_FEELING_OPTIONS = [
  "vivant",
  "libre",
  "heureux",
  "puissant",
  "apaisé",
] as const;
export type SportFeeling = (typeof SPORT_FEELING_OPTIONS)[number];

/** Options du prompt "Je pratique plutôt le sport..." */
export const SPORT_TIME_OPTIONS = ["matin", "midi", "soir"] as const;
export type SportTime = (typeof SPORT_TIME_OPTIONS)[number];

/** Placeholder : si true, accepte les photos sans vérification réelle (pour dev) */
export const PHOTO_VERIFICATION_PLACEHOLDER = true;

/** Types de photos interdits (anti-fake) */
export const PHOTO_FORBIDDEN_TYPES = [
  "paysage",
  "objet",
  "nourriture",
  "jambes_seules",
  "silhouette_floue",
  "photo_vide",
] as const;

/** Critères de validation minimum */
export const PHOTO_VALIDATION_CRITERIA = {
  FACE_REQUIRED: true,
  BODY_PREFERRED: true,
} as const;

/** Options ambiance pour Spots sportifs (V2) */
export const SPOT_AMBIANCE_OPTIONS = [
  "décontracté",
  "intense",
  "mixte",
  "familial",
  "entre amis",
] as const;
export type SpotAmbiance = (typeof SPOT_AMBIANCE_OPTIONS)[number];

/** Options moment préféré pour Spots sportifs (V2) */
export const SPOT_MOMENT_OPTIONS = [
  "matin",
  "après-midi",
  "soir",
  "week-end",
] as const;
export type SpotMoment = (typeof SPOT_MOMENT_OPTIONS)[number];
