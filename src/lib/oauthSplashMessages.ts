import type { TranslationKey } from "../i18n/index";

/** Phrases émotionnelles affichées pendant OAuth — jamais de libellé technique. */
export const OAUTH_SPLASH_MESSAGE_KEYS = [
  "auth_oauth_splash_msg_1",
  "auth_oauth_splash_msg_2",
  "auth_oauth_splash_msg_3",
  "auth_oauth_splash_msg_4",
  "auth_oauth_splash_msg_5",
] as const satisfies readonly TranslationKey[];

export const OAUTH_SPLASH_ROTATION_MS = 2400;

/** Copie FR pour le masque natif iOS (hors i18n web). */
export const OAUTH_SPLASH_MESSAGES_FR = [
  "Trouver l'amour par le sport.",
  "Match → activité → rencontre.",
  "Le sport est le meilleur prétexte pour créer du vrai.",
  "Tu fais du sport ? Tu es au bon endroit.",
  "SPLove connecte les sportifs qui veulent vivre une vraie rencontre.",
] as const;
