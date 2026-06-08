import { supabase } from "./supabase";
import { selectProfilesFirstMatch } from "./profileSelect";
import { SPLovePhotoLog, snapshotProfilePhotoFields } from "./profilePhotoPipelineLog";
import { PhotoFlowLog } from "./photoFlowLog";

const PROFILE_PHOTO_FIELD_KEYS = [
  "portrait_url",
  "fullbody_url",
  "main_photo_url",
  "avatar_url",
] as const;

/** Fusionne la ligne écran sans écraser des URLs photo déjà connues par des valeurs vides. */
export function mergeProfileScreenRowPreservingPhotos(
  base: Record<string, unknown> | null | undefined,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(base ?? {}), ...row };
  for (const key of PROFILE_PHOTO_FIELD_KEYS) {
    const fromRow = merged[key];
    const fromBase = base?.[key];
    const rowEmpty = typeof fromRow !== "string" || !fromRow.trim();
    const baseFilled = typeof fromBase === "string" && fromBase.trim();
    if (rowEmpty && baseFilled) merged[key] = fromBase;
  }
  return merged;
}

/** Champs affichés sur Profil / EditProfile — indépendants du palier FAST auth post-OAuth. */
const PROFILE_SCREEN_SELECT_TIERS: string[] = [
  "id, portrait_url, fullbody_url, main_photo_url, avatar_url, city, latitude, longitude, discovery_radius_km, location_source, preferred_age_min, preferred_age_max, sport_phrase, intent, looking_for, sport_match_preference, height_cm, updated_at",
  "id, portrait_url, fullbody_url, main_photo_url, avatar_url, city, latitude, longitude, discovery_radius_km, preferred_age_min, preferred_age_max, sport_phrase, intent, looking_for, updated_at",
  "id, portrait_url, fullbody_url, main_photo_url, avatar_url, city, latitude, longitude, discovery_radius_km, sport_phrase, intent, looking_for, updated_at",
  "id, portrait_url, fullbody_url, main_photo_url, avatar_url, city, latitude, longitude, discovery_radius_km, updated_at",
];

/**
 * Recharge geo, photos, préférences d'âge pour les écrans Profil / EditProfile.
 * Le cache AuthContext (PROFILE_LOAD_TIERS_FAST_AUTH) omet souvent ces colonnes sur iOS.
 */
export async function fetchProfileScreenFields(
  userId: string,
): Promise<Record<string, unknown> | null> {
  if (!userId) return null;
  const { data, usedSelect } = await selectProfilesFirstMatch(
    supabase,
    userId,
    PROFILE_SCREEN_SELECT_TIERS,
    "[profile-screen-hydrate]",
  );
  if (!data) {
    SPLovePhotoLog.profileLoadEmpty({
      source: "fetchProfileScreenFields",
      userId,
      error: "no_row",
      extra: { usedSelectSample: usedSelect?.slice(0, 80) ?? null },
    });
    return null;
  }
  const photos = snapshotProfilePhotoFields(data);
  PhotoFlowLog.profileReadback({
    userId,
    source: "fetchProfileScreenFields",
    portrait_url: photos?.portrait_url ?? null,
    fullbody_url: photos?.fullbody_url ?? null,
    main_photo_url: photos?.main_photo_url ?? null,
    avatar_url: photos?.avatar_url ?? null,
  });
  if (photos?.has_portrait || photos?.has_fullbody || photos?.has_main) {
    SPLovePhotoLog.profileLoadSuccess({
      source: "fetchProfileScreenFields",
      userId,
      profileRow: data,
      extra: { usedSelectSample: usedSelect?.slice(0, 80) ?? null },
    });
  } else {
    SPLovePhotoLog.profileLoadEmpty({
      source: "fetchProfileScreenFields",
      userId,
      profileRow: data,
      error: "row_without_photo_urls",
      extra: { usedSelectSample: usedSelect?.slice(0, 80) ?? null },
    });
  }
  return data;
}
