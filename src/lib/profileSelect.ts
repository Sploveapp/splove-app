/**
 * Colonnes `profiles` lues par AuthContext (`fetchProfile`).
 * Inclut `is_photo_verified` si la migration photo est présente.
 */
export const PROFILE_SELECT =
  "id, first_name, birth_date, gender, looking_for, intent, portrait_url, fullbody_url, main_photo_url, profile_completed, is_photo_verified, photo_status, needs_adapted_activities";

/**
 * Colonnes demandées au **retour** de l’upsert onboarding uniquement (aligné sur les colonnes réellement présentes en base).
 */
export const PROFILE_UPSERT_ONBOARDING_SELECT =
  "id, first_name, birth_date, gender, looking_for, intent, portrait_url, fullbody_url, main_photo_url, profile_completed, is_photo_verified, photo_status, needs_adapted_activities";
