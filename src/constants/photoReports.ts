/** Valeurs stockées en `photo_reports.reason` (texte stable). */
export const PHOTO_REPORT_REASON_VALUES = [
  "nudity_sexual",
  "violence_shocking",
  "fake_impersonation",
  "irrelevant_photo",
  "apparent_minor",
  "group_unidentifiable",
] as const;

export type PhotoReportReasonValue = (typeof PHOTO_REPORT_REASON_VALUES)[number];

export const PHOTO_REPORT_REASON_LABELS: Record<PhotoReportReasonValue, string> = {
  nudity_sexual: "Nudité / contenu sexuel",
  violence_shocking: "Violence / contenu choquant",
  fake_impersonation: "Faux profil / usurpation",
  irrelevant_photo: "Photo non pertinente",
  apparent_minor: "Mineur apparent",
  group_unidentifiable: "Photo de groupe / personne non identifiable",
};
