/**
 * Colonnes `profiles` lues par AuthContext (`fetchProfile`).
 * Inclut `is_photo_verified` si la migration photo est présente.
 */
export const PROFILE_SELECT =
  "id, first_name, birth_date, gender, looking_for, intent, portrait_url, fullbody_url, main_photo_url, profile_completed, is_photo_verified, needs_adapted_activities, portrait_photo_status, body_photo_status, photo_verification_status, portrait_rejection_code, body_rejection_code";

/**
 * Colonnes demandées au **retour** de l’upsert onboarding uniquement.
 * Aucune colonne Veriff (`photo_verification_*`) — évite l’erreur si la table n’a pas ces colonnes.
 * Le `profilePayload` d’onboarding n’envoie jamais ces champs non plus.
 */
export const PROFILE_UPSERT_ONBOARDING_SELECT =
  "id, first_name, birth_date, gender, looking_for, intent, portrait_url, fullbody_url, main_photo_url, profile_completed, needs_adapted_activities, portrait_photo_status, body_photo_status, photo_verification_status, portrait_rejection_code, body_rejection_code";
