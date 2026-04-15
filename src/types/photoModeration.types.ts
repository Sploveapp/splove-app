export type PhotoModerationStatus = "approved" | "pending_review" | "rejected";

/** Champs normalisés renvoyés par l’Edge Function `moderate-photo` (scores 0–1). */
export type ModerationNormalizedScores = {
  nudity_score: number;
  violence_score: number;
  weapon_score: number;
  spoof_score: number;
  multiple_faces: boolean;
  face_visible: boolean;
  irrelevant_image: boolean;
  low_quality: boolean;
};

export type ModeratePhotoResponse = {
  status: PhotoModerationStatus;
  risk_score?: number;
  decision_reason?: string;
  ui_reason_code?: string | null;
  provider?: string;
  normalized?: ModerationNormalizedScores;
  error?: string;
  detail?: string | null;
};
