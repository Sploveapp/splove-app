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

export type ProfilePhotoUrlRow = {
  portrait_url?: string | null;
  fullbody_url?: string | null;
  main_photo_url?: string | null;
  avatar_url?: string | null;
};

/** Au moins une URL canonique non vide (main, portrait ou fullbody). */
export function profileRowHasCanonicalPhotos(
  row: Record<string, unknown> | null | undefined,
): boolean {
  if (!row) return false;
  const portrait = typeof row.portrait_url === "string" ? row.portrait_url.trim() : "";
  const fullbody = typeof row.fullbody_url === "string" ? row.fullbody_url.trim() : "";
  const main = typeof row.main_photo_url === "string" ? row.main_photo_url.trim() : "";
  return portrait.length > 0 || fullbody.length > 0 || main.length > 0;
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
  }
  if (fullbody) next.fullbody_url = fullbody;
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
    ...(portrait ? { portrait_url: portrait, avatar_url: portrait } : {}),
    ...(fullbody ? { fullbody_url: fullbody } : {}),
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
  if (!profileRowHasCanonicalPhotos(profile)) {
    throw new Error(
      "REGRESSION: photo moderation validated but no canonical photo URL (main_photo_url, portrait_url, avatar_url, fullbody_url)",
    );
  }
}
