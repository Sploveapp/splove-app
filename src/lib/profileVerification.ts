/**
 * Vérification profil — le badge « Profil vérifié » reflète uniquement l’identité (Veriff / équivalent),
 * pas la simple validation modération des photos.
 */

/** Badge vert « Profil vérifié » : identité attestée uniquement (`identity_verified` ou Veriff approved). */
export function isIdentityVerified(profile: {
  identity_verified?: boolean | null;
  veriff_status?: string | null;
} | null | undefined): boolean {
  if (!profile || typeof profile !== "object") return false;
  if (profile.identity_verified === true) return true;
  return String(profile.veriff_status ?? "").trim().toLowerCase() === "approved";
}

/**
 * Photo(s) acceptée(s) ou synthèse modération OK — sans prétendre à une vérif d’identité.
 * Pour libellés discrets (ex. page profil uniquement).
 */
export function hasProfilePhotosModerationValidated(profile: {
  photo_status?: string | null;
  photo_moderation_overall?: string | null;
  photo1_status?: string | null;
  photo2_status?: string | null;
} | null | undefined): boolean {
  if (!profile) return false;
  const rejected = String(profile.photo_status ?? "").trim().toLowerCase() === "rejected";
  if (rejected) return false;
  if (isPhotoVerificationApproved(profile.photo_status)) return true;
  const overall = String(profile.photo_moderation_overall ?? "").trim().toLowerCase();
  if (overall === "approved") return true;
  const p1 = String(profile.photo1_status ?? "").trim().toLowerCase();
  const p2 = String(profile.photo2_status ?? "").trim().toLowerCase();
  return p1 === "approved" && p2 === "approved";
}

/** Accès Discover : uniquement si la validation globale des photos est « approved ». */
export function isPhotoVerificationApproved(
  status: string | null | undefined,
): boolean {
  return (status ?? "").toLowerCase().trim() === "approved";
}

export type PhotoVerificationStatusField =
  | "approved"
  | "rejected"
  | "pending"
  | string;

export type PhotoRejectionCode =
  | "face_not_detected"
  | "silhouette_not_visible"
  | "not_personal"
  | "non_compliant"
  | string;

/** Libellés UX pour codes stockés en BDD (modération). */
export const PHOTO_REJECTION_CODE_MESSAGES: Record<string, string> = {
  face_not_detected: "Visage non détecté ou photo portrait non conforme.",
  non_compliant: "Photo portrait non conforme aux consignes.",
  silhouette_not_visible: "Silhouette / corps entier insuffisamment visible.",
  not_personal: "Image non personnelle (objet, paysage, logo, capture d’écran, etc.).",
};

export function photoRejectionCodeMessage(
  code: string | null | undefined,
): string | null {
  if (code == null || String(code).trim() === "") return null;
  const key = String(code).toLowerCase().trim();
  return PHOTO_REJECTION_CODE_MESSAGES[key] ?? null;
}

/** Messages précis pour l’utilisateur (portrait + corps). */
export function collectPhotoRejectionUserMessages(profile: {
  portrait_rejection_code?: string | null;
  body_rejection_code?: string | null;
}): string[] {
  const out: string[] = [];
  const a = photoRejectionCodeMessage(profile.portrait_rejection_code);
  const b = photoRejectionCodeMessage(profile.body_rejection_code);
  if (a) out.push(a);
  if (b && b !== a) out.push(b);
  return out;
}

/** Libellé court pour debug — pas pour l’UI principale Discover. */
export function photoVerificationStatusLabel(
  status: PhotoVerificationStatusField | null | undefined,
): string {
  const s = (status ?? "pending").toLowerCase();
  if (s === "approved") return "approuvé";
  if (s === "rejected") return "refusé";
  return "en attente";
}
