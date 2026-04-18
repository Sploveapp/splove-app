/**
 * Vérification photos — MVP : badge « Profil vérifié » = `photo_status === 'approved'`.
 * Détail par photo / codes rejet : `portrait_rejection_code`, `body_rejection_code`, etc.
 */

/**
 * Badge « Profil vérifié » (Discover, cartes, profil) — uniquement `photo_status`.
 */
export function isPhotoVerified(profile: {
  photo_status?: string | null;
}): boolean {
  return isPhotoVerificationApproved(profile.photo_status);
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
