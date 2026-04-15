import type { PhotoModerationStatus } from "../types/photoModeration.types";

const REJECTED_BASE =
  "Cette photo ne respecte pas nos règles. Choisis une photo récente, claire, où l’on te voit vraiment.";

const REASON_LINES: Record<string, string> = {
  face_not_visible: "visage non assez visible",
  multiple_people: "plusieurs personnes",
  irrelevant_photo: "photo non pertinente",
  heavy_filters: "filtres trop importants",
  safety_rules: "règles de sécurité non respectées",
};

export function photoModerationHeadline(status: PhotoModerationStatus): string {
  if (status === "approved") return "Photo validée";
  if (status === "pending_review") return "Ta photo est en cours de vérification";
  return REJECTED_BASE;
}

export function photoModerationRejectedDetail(uiReasonCode: string | null | undefined): string | null {
  if (!uiReasonCode) return null;
  return REASON_LINES[uiReasonCode] ?? null;
}
