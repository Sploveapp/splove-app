import { supabase } from "./supabase";
import { selectProfilesFirstMatch } from "./profileSelect";
import { SPLovePhotoLog, snapshotProfilePhotoFields } from "./profilePhotoPipelineLog";
import { PhotoFlowLog } from "./photoFlowLog";
import {
  buildOnboardingPhotoUpsertPayload,
  normalizeProfileRowCanonicalPhotos,
  profileRowHasCanonicalPhotos,
} from "./onboardingProfilePhotos";

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

/**
 * Fusion profil Auth : remplace la row entrante sauf si une photo valide en cache
 * serait écrasée par null / chaîne vide (refetch / loadProfile).
 */
export function mergeAuthProfileRow(
  prev: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const prevId = typeof prev?.id === "string" ? prev.id.trim() : "";
  const incomingId = typeof incoming.id === "string" ? incoming.id.trim() : "";
  if (!prevId || prevId !== incomingId) {
    return incoming;
  }
  return mergeProfileScreenRowPreservingPhotos(prev, incoming);
}

/** Colonnes canoniques réellement présentes en BDD (sans résolution legacy). */
function rawRowHasCanonicalPhotoColumns(row: Record<string, unknown>): boolean {
  const portrait = typeof row.portrait_url === "string" ? row.portrait_url.trim() : "";
  const fullbody = typeof row.fullbody_url === "string" ? row.fullbody_url.trim() : "";
  const main = typeof row.main_photo_url === "string" ? row.main_photo_url.trim() : "";
  return portrait.length > 0 || fullbody.length > 0 || main.length > 0;
}

/** Réécrit les colonnes canoniques en BDD si seules les colonnes legacy contiennent les URLs. */
async function healCanonicalProfilePhotosInDbIfNeeded(
  userId: string,
  rawRow: Record<string, unknown>,
  normalizedRow: Record<string, unknown>,
): Promise<void> {
  if (!userId || rawRowHasCanonicalPhotoColumns(rawRow)) return;
  if (!profileRowHasCanonicalPhotos(normalizedRow)) return;

  const portrait =
    typeof normalizedRow.portrait_url === "string" ? normalizedRow.portrait_url : "";
  const fullbody =
    typeof normalizedRow.fullbody_url === "string" ? normalizedRow.fullbody_url : "";
  const payload = buildOnboardingPhotoUpsertPayload(userId, portrait, fullbody, supabase);
  if (!payload) return;

  PhotoFlowLog.profilePayloadSent({
    userId,
    source: "healCanonicalProfilePhotosInDbIfNeeded",
    portrait_url: portrait || null,
    fullbody_url: fullbody || null,
    main_photo_url: (portrait || fullbody) || null,
    avatar_url: portrait || null,
  });

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select("id, portrait_url, fullbody_url, main_photo_url, avatar_url")
    .maybeSingle();

  if (error) {
    console.warn("[profile-screen-hydrate] heal canonical photos failed", {
      userId,
      message: error.message,
    });
    return;
  }

  const saved = (data ?? payload) as Record<string, unknown>;
  PhotoFlowLog.profileReadback({
    userId,
    source: "healCanonicalProfilePhotosInDbIfNeeded",
    portrait_url: typeof saved.portrait_url === "string" ? saved.portrait_url : null,
    fullbody_url: typeof saved.fullbody_url === "string" ? saved.fullbody_url : null,
    main_photo_url: typeof saved.main_photo_url === "string" ? saved.main_photo_url : null,
    avatar_url: typeof saved.avatar_url === "string" ? saved.avatar_url : null,
  });
  PhotoFlowLog.savedToProfile({
    userId,
    profileId: userId,
    photoField: portrait ? "portrait_url" : "fullbody_url",
    storedRef: portrait || fullbody,
    main_photo_url: portrait || fullbody,
    portrait_url: portrait || null,
  });
}

/** Champs affichés sur Profil / EditProfile — indépendants du palier FAST auth post-OAuth. */
const PROFILE_SCREEN_SELECT_TIERS: string[] = [
  "id, portrait_url, fullbody_url, main_photo_url, avatar_url, portrait_path, fullbody_path, activity_photo_path, photo2_path, city, latitude, longitude, discovery_radius_km, location_source, preferred_age_min, preferred_age_max, sport_phrase, intent, looking_for, sport_match_preference, height_cm, updated_at",
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

  const rawRow = data as Record<string, unknown>;
  const normalizedRow = normalizeProfileRowCanonicalPhotos(rawRow, supabase) ?? rawRow;

  PhotoFlowLog.screenProfileRow({
    userId,
    screen: "profile_hydrate",
    source: "fetchProfileScreenFields",
    row: normalizedRow,
  });

  void healCanonicalProfilePhotosInDbIfNeeded(userId, rawRow, normalizedRow).catch(() => undefined);

  const photos = snapshotProfilePhotoFields(normalizedRow);
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
      profileRow: normalizedRow,
      extra: { usedSelectSample: usedSelect?.slice(0, 80) ?? null },
    });
  } else {
    SPLovePhotoLog.profileLoadEmpty({
      source: "fetchProfileScreenFields",
      userId,
      profileRow: normalizedRow,
      error: "row_without_photo_urls",
      extra: { usedSelectSample: usedSelect?.slice(0, 80) ?? null },
    });
  }
  return normalizedRow;
}
