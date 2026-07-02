/**
 * URLs photo canoniques après onboarding — logique partagée Profil / tests de régression.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { pickPrimaryProfilePhotoStoredRef } from "./profilePhotoDisplayUrl";
import { normalizeProfilePhotoStoredRef } from "./profilePhotoUpload";
import { hasProfilePhotosModerationValidated } from "./profileVerification";

export const PROFILE_CANONICAL_PHOTO_COLUMNS = [
  "portrait_url",
  "fullbody_url",
  "main_photo_url",
  "avatar_url",
] as const;

/** Colonnes legacy encore lues en prod (sanitize onboarding / schéma partiel). */
export const PROFILE_LEGACY_PORTRAIT_REF_KEYS = [
  "portrait_path",
] as const;

export const PROFILE_LEGACY_FULLBODY_REF_KEYS = [
  "fullbody_path",
  "activity_photo_path",
  "photo2_path",
] as const;

export type ProfilePhotoUrlRow = {
  portrait_url?: string | null;
  fullbody_url?: string | null;
  main_photo_url?: string | null;
  avatar_url?: string | null;
};

function pickFirstTrimmedRef(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const t = typeof candidate === "string" ? candidate.trim() : "";
    if (t) return t;
  }
  return "";
}

/** URL Storage SPLove (`profile-photos`) — pas un avatar OAuth externe. */
export function isSploveProfileStoragePhotoRef(value: string | null | undefined): boolean {
  const t = typeof value === "string" ? value.trim() : "";
  if (!t) return false;
  return t.includes("/profile-photos/") || t.startsWith("profile-photos/");
}

/**
 * Portrait : canonique → legacy → avatar Storage (évite avatar Google sans photo uploadée).
 * Même ordre que l’hydratation onboarding.
 */
export function resolvePortraitStoredRefFromRow(
  row: Record<string, unknown> | null | undefined,
  supabase?: SupabaseClient,
): string {
  if (!row) return "";
  const portrait = pickFirstTrimmedRef(row.portrait_url);
  const main = pickFirstTrimmedRef(row.main_photo_url);
  const avatar = pickFirstTrimmedRef(row.avatar_url);
  const legacy = pickFirstTrimmedRef(...PROFILE_LEGACY_PORTRAIT_REF_KEYS.map((k) => row[k]));

  const ordered: string[] = [];
  if (portrait) ordered.push(portrait);
  if (main && isSploveProfileStoragePhotoRef(main)) ordered.push(main);
  if (avatar && isSploveProfileStoragePhotoRef(avatar)) ordered.push(avatar);
  if (legacy) ordered.push(legacy);
  if (!ordered.length && main) ordered.push(main);
  if (!ordered.length && avatar) ordered.push(avatar);

  const raw = ordered[0] ?? "";
  return raw ? normalizeProfilePhotoStoredRef(raw, supabase).trim() : "";
}

/** Silhouette : fullbody_url puis chemins legacy (photo2_path, etc.). */
export function resolveFullbodyStoredRefFromRow(
  row: Record<string, unknown> | null | undefined,
  supabase?: SupabaseClient,
): string {
  if (!row) return "";
  const raw = pickFirstTrimmedRef(
    row.fullbody_url,
    ...PROFILE_LEGACY_FULLBODY_REF_KEYS.map((k) => row[k]),
  );
  return raw ? normalizeProfilePhotoStoredRef(raw, supabase).trim() : "";
}

/**
 * Aligne portrait_url / fullbody_url / main_photo_url / avatar_url depuis canonique + legacy.
 * Ne modifie pas la row si aucune référence utilisable.
 */
export function normalizeProfileRowCanonicalPhotos(
  row: Record<string, unknown> | null | undefined,
  supabase?: SupabaseClient,
): Record<string, unknown> | null {
  if (!row || typeof row !== "object") return null;
  const portrait = resolvePortraitStoredRefFromRow(row, supabase);
  const fullbody = resolveFullbodyStoredRefFromRow(row, supabase);
  if (!portrait && !fullbody) return row;

  const next: Record<string, unknown> = { ...row };
  if (portrait) {
    next.portrait_url = portrait;
    const avatar = pickFirstTrimmedRef(next.avatar_url);
    if (!avatar || !isSploveProfileStoragePhotoRef(avatar)) {
      next.avatar_url = portrait;
    }
  }
  if (fullbody) next.fullbody_url = fullbody;
  next.main_photo_url = portrait || fullbody;
  return next;
}

/** Au moins une URL canonique non vide (main, portrait ou fullbody). */
export function profileRowHasCanonicalPhotos(
  row: Record<string, unknown> | null | undefined,
): boolean {
  if (!row) return false;
  const normalized = normalizeProfileRowCanonicalPhotos(row) ?? row;
  const portrait =
    typeof normalized.portrait_url === "string" ? normalized.portrait_url.trim() : "";
  const fullbody =
    typeof normalized.fullbody_url === "string" ? normalized.fullbody_url.trim() : "";
  const main =
    typeof normalized.main_photo_url === "string" ? normalized.main_photo_url.trim() : "";
  const avatar =
    typeof normalized.avatar_url === "string" &&
    isSploveProfileStoragePhotoRef(normalized.avatar_url)
      ? normalized.avatar_url.trim()
      : "";
  return portrait.length > 0 || fullbody.length > 0 || main.length > 0 || avatar.length > 0;
}

/** Référence affichage principale : main → portrait → avatar. */
export function pickCanonicalPhotoStoredRef(
  profile: ProfilePhotoUrlRow | null | undefined,
): string | null {
  return pickPrimaryProfilePhotoStoredRef(profile);
}

/** Fusionne les URLs uploadées dans une ligne profil (commit Auth / readback). */
export function mergeOnboardingPhotosIntoProfileRow(
  row: Record<string, unknown>,
  portraitUrl: string,
  fullbodyUrl: string,
  supabase?: SupabaseClient,
): Record<string, unknown> {
  const portrait = normalizeProfilePhotoStoredRef(portraitUrl, supabase).trim();
  const fullbody = normalizeProfilePhotoStoredRef(fullbodyUrl, supabase).trim();
  if (!portrait && !fullbody) return row;
  const next = { ...row };
  if (portrait) {
    next.portrait_url = portrait;
    if (!String(next.avatar_url ?? "").trim()) next.avatar_url = portrait;
    next.portrait_path = portrait;
  }
  if (fullbody) {
    next.fullbody_url = fullbody;
    next.photo2_path = fullbody;
    next.activity_photo_path = fullbody;
    next.fullbody_path = fullbody;
  }
  next.main_photo_url = portrait || fullbody;
  return next;
}

/** Payload upsert dédié photos (ensureOnboardingPhotosInProfile). */
export function buildOnboardingPhotoUpsertPayload(
  userId: string,
  portraitUrl: string,
  fullbodyUrl: string,
  supabase?: SupabaseClient,
): Record<string, unknown> | null {
  const portrait = normalizeProfilePhotoStoredRef(portraitUrl, supabase).trim();
  const fullbody = normalizeProfilePhotoStoredRef(fullbodyUrl, supabase).trim();
  if (!portrait && !fullbody) return null;

  return {
    id: userId,
    updated_at: new Date().toISOString(),
    ...(portrait
      ? {
          portrait_url: portrait,
          avatar_url: portrait,
          portrait_path: portrait,
        }
      : {}),
    ...(fullbody
      ? {
          fullbody_url: fullbody,
          photo2_path: fullbody,
          activity_photo_path: fullbody,
          fullbody_path: fullbody,
        }
      : {}),
    main_photo_url: portrait || fullbody,
  };
}

/**
 * Invariant régression Linda Test : « Photo validée » sans URL canonique = bug.
 * @throws si modération approuvée mais aucune URL main/portrait/avatar/fullbody utilisable
 */
export function assertValidatedProfileHasCanonicalPhotoUrl(
  profile: Record<string, unknown> | null | undefined,
): void {
  if (!profile || typeof profile !== "object") return;
  if (!hasProfilePhotosModerationValidated(profile)) return;
  const normalized = normalizeProfileRowCanonicalPhotos(profile) ?? profile;
  if (!profileRowHasCanonicalPhotos(normalized)) {
    throw new Error(
      "REGRESSION: photo moderation validated but no canonical photo URL (main_photo_url, portrait_url, avatar_url, fullbody_url)",
    );
  }
}
