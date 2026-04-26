/**
 * SPLove — Signalements + référence historique filtres.
 * Blocage anti-sortie (texte) : `src/lib/antiExitValidator.ts` (API historique : `contentModeration.ts`).
 */

// ——— Report reasons ———

export const REPORT_REASONS = [
  { value: "fake_profile", label: "Faux profil" },
  { value: "scam", label: "Arnaque ou fraude" },
  { value: "off_platform_contact", label: "Tentative de contact hors SPLove" },
  { value: "prostitution", label: "Prostitution ou contenu sexuel payant" },
  { value: "harassment", label: "Harcèlement" },
  { value: "inappropriate_behavior", label: "Comportement inapproprié" },
  { value: "spam", label: "Spam ou publicité" },
] as const;

export type ReportReasonValue = (typeof REPORT_REASONS)[number]["value"];
