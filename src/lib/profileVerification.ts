/**
 * Vérification d’identité / photos — aligné sur `profiles` :
 * - `is_photo_verified` : badge « Profil vérifié » (ex. Veriff).
 * - `photo_verification_status` : validation produit des deux photos (pending | approved | rejected).
 * - `portrait_photo_status` / `body_photo_status` : détail par photo.
 */

export function isPhotoVerified(profile: {
  is_photo_verified?: boolean | null;
}): boolean {
  return profile.is_photo_verified === true;
}

/** Accès Discover : uniquement si la validation globale des photos est « approved ». */
export function isPhotoVerificationApproved(
  status: string | null | undefined
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
  code: string | null | undefined
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
  status: PhotoVerificationStatusField | null | undefined
): string {
  const s = (status ?? "pending").toLowerCase();
  if (s === "approved") return "approuvé";
  if (s === "rejected") return "refusé";
  return "en attente";
}
