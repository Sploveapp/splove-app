import sploveMark from "../assets/welcome/splove-mark.png";
import { photoUrlPrefix } from "./profilePhotoPipelineLog";
import { isKnownBrokenProfilePhotoUrl } from "./profilePhotoStorageHealth";
import type { ProfilePhotoUrlFields } from "./profilePhotoDisplayUrl";
import {
  resolvePortraitStoredRefFromRow,
} from "./onboardingProfilePhotos";
import { supabase } from "./supabase";

/** Logo SPLove — fallback UI quand aucune photo valide n’est affichable. */
export const SPLOVE_PROFILE_PHOTO_FALLBACK_SRC: string = sploveMark;

/**
 * Ordre canonique photo principale (source de vérité app).
 * Pas de `profile_photo_url` ni `photos[0]` dans le schéma Supabase actuel.
 */
export const USER_MAIN_PHOTO_PRIMARY_FIELD_ORDER = [
  "main_photo_url",
  "portrait_url",
  "avatar_url",
] as const;

/** Alias historique — même ordre que {@link USER_MAIN_PHOTO_PRIMARY_FIELD_ORDER}. */
export const USER_MAIN_PHOTO_FIELD_ORDER = USER_MAIN_PHOTO_PRIMARY_FIELD_ORDER;

export type UserMainPhotoPrimaryField = (typeof USER_MAIN_PHOTO_PRIMARY_FIELD_ORDER)[number];
export type UserMainPhotoSourceField = UserMainPhotoPrimaryField | "fullbody_url";

export type UserMainPhotoResult = {
  userId: string | null;
  /** Référence persistée en BDD (URL publique Storage ou pass-through). */
  storedRef: string | null;
  /** Colonne Supabase d’où provient `storedRef`. */
  sourceField: UserMainPhotoSourceField | null;
  fieldSnapshot: {
    main_photo_url: string | null;
    portrait_url: string | null;
    avatar_url: string | null;
    fullbody_url: string | null;
  };
};

function trimPhotoRef(value: unknown): string | null {
  const t = typeof value === "string" ? value.trim() : "";
  if (!t) return null;
  if (isKnownBrokenProfilePhotoUrl(t)) return null;
  return t;
}

/**
 * Source de vérité unique : photo principale utilisateur depuis un profil / user row.
 * Retourne la référence BDD stable (pas l’URL signée temporaire).
 */
export function getUserMainPhoto(
  profile: (ProfilePhotoUrlFields & { id?: string | null }) | null | undefined,
  userId?: string | null,
): UserMainPhotoResult {
  const fieldSnapshot = {
    main_photo_url: trimPhotoRef(profile?.main_photo_url),
    portrait_url: trimPhotoRef(profile?.portrait_url),
    avatar_url: trimPhotoRef(profile?.avatar_url),
    fullbody_url: trimPhotoRef(profile?.fullbody_url),
  };

  let storedRef: string | null = null;
  let sourceField: UserMainPhotoSourceField | null = null;

  for (const key of USER_MAIN_PHOTO_PRIMARY_FIELD_ORDER) {
    const ref = fieldSnapshot[key];
    if (ref) {
      storedRef = ref;
      sourceField = key;
      break;
    }
  }

  if (!storedRef && fieldSnapshot.fullbody_url) {
    storedRef = fieldSnapshot.fullbody_url;
    sourceField = "fullbody_url";
  }

  if (!storedRef && profile && typeof profile === "object") {
    const legacyPortrait = trimPhotoRef(
      resolvePortraitStoredRefFromRow(profile as Record<string, unknown>, supabase),
    );
    if (legacyPortrait) {
      storedRef = legacyPortrait;
      sourceField = "portrait_url";
    }
  }

  const resolvedUserId =
    (typeof userId === "string" && userId.trim()) ||
    (typeof profile?.id === "string" && profile.id.trim()) ||
    null;

  return {
    userId: resolvedUserId,
    storedRef,
    sourceField,
    fieldSnapshot,
  };
}

/** Référence BDD stable de la photo principale — alias pratique pour les écrans. */
export function getUserMainPhotoUrl(
  profile: (ProfilePhotoUrlFields & { id?: string | null }) | null | undefined,
  userId?: string | null,
): string | null {
  return getUserMainPhoto(profile, userId).storedRef;
}

/** Candidates ordonnées pour résolution async (signed URL, repli champ suivant). */
export function getUserMainPhotoRefCandidates(
  profile: ProfilePhotoUrlFields | null | undefined,
): { refs: string[]; fieldByRef: Record<string, UserMainPhotoSourceField> } {
  const refs: string[] = [];
  const fieldByRef: Record<string, UserMainPhotoSourceField> = {};
  const seen = new Set<string>();

  for (const key of USER_MAIN_PHOTO_PRIMARY_FIELD_ORDER) {
    const ref = trimPhotoRef(profile?.[key]);
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
    fieldByRef[ref] = key;
  }

  const fullbody = trimPhotoRef(profile?.fullbody_url);
  if (fullbody && !seen.has(fullbody)) {
    refs.push(fullbody);
    fieldByRef[fullbody] = "fullbody_url";
  }

  return { refs, fieldByRef };
}

/** Log temporaire pipeline photo — filtrable `[UserMainPhoto]`. */
export function logUserMainPhotoDisplay(context: string, payload: {
  userId?: string | null;
  uploadedUrl?: string | null;
  savedUrl?: string | null;
  readbackUrl?: string | null;
  storedRef?: string | null;
  sourceField?: string | null;
  displaySrc?: string | null;
  displaySource?: string | null;
  storageVerified?: boolean | null;
  extra?: Record<string, unknown>;
}): void {
  console.log("[UserMainPhoto]", context, {
    userId: payload.userId ?? null,
    uploadedUrl: photoUrlPrefix(payload.uploadedUrl),
    savedUrl: photoUrlPrefix(payload.savedUrl),
    readbackUrl: photoUrlPrefix(payload.readbackUrl),
    storedRef: photoUrlPrefix(payload.storedRef),
    sourceField: payload.sourceField ?? null,
    displaySrc: photoUrlPrefix(payload.displaySrc),
    displaySource: payload.displaySource ?? null,
    storageVerified: payload.storageVerified ?? null,
    ...payload.extra,
  });
}
