import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PROFILE_PHOTO_URL_FIELDS,
  type ProfilePhotoUrlField,
  collectProfilePhotoUrlsFromRow,
  isProfilePhotosStoragePublicUrl,
  probeProfilePhotoStorageHealth,
} from "./profilePhotoStorageHealth";

export type BrokenProfilePhotoSlots = {
  portrait: boolean;
  fullbody: boolean;
};

export type BrokenProfilePhotoReconcileResult = {
  row: Record<string, unknown>;
  clearedFields: ProfilePhotoUrlField[];
  brokenUrls: string[];
  changed: boolean;
  reuploadSlots: BrokenProfilePhotoSlots;
};

const REUPLOAD_SLOTS_KEY_PREFIX = "splove_broken_photo_slots_v1:";

function trimUrl(value: unknown): string | null {
  const t = typeof value === "string" ? value.trim() : "";
  return t || null;
}

function storageKey(userId: string): string {
  return `${REUPLOAD_SLOTS_KEY_PREFIX}${userId}`;
}

export function markBrokenProfilePhotoReuploadSlots(
  userId: string,
  slots: BrokenProfilePhotoSlots,
): void {
  if (!userId) return;
  if (!slots.portrait && !slots.fullbody) return;
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify(slots));
  } catch {
    /* ignore */
  }
}

export function peekBrokenProfilePhotoReuploadSlots(
  userId: string | null | undefined,
): BrokenProfilePhotoSlots | null {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BrokenProfilePhotoSlots;
    if (typeof parsed !== "object" || parsed == null) return null;
    return {
      portrait: Boolean(parsed.portrait),
      fullbody: Boolean(parsed.fullbody),
    };
  } catch {
    return null;
  }
}

export function clearBrokenProfilePhotoReuploadSlots(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    sessionStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}

export function brokenProfilePhotoReuploadMessageKey(
  slots: BrokenProfilePhotoSlots | null | undefined,
): string | null {
  if (!slots) return null;
  if (slots.portrait && slots.fullbody) return "profile_photo_broken_reupload_both";
  if (slots.portrait) return "profile_photo_broken_reupload_portrait";
  if (slots.fullbody) return "profile_photo_broken_reupload_fullbody";
  return null;
}

function computeReuploadSlots(
  rowBefore: Record<string, unknown>,
  rowAfter: Record<string, unknown>,
): BrokenProfilePhotoSlots {
  const hadPortrait = Boolean(
    trimUrl(rowBefore.portrait_url) ||
      trimUrl(rowBefore.main_photo_url) ||
      trimUrl(rowBefore.avatar_url),
  );
  const hasPortrait = Boolean(
    trimUrl(rowAfter.portrait_url) ||
      trimUrl(rowAfter.main_photo_url) ||
      trimUrl(rowAfter.avatar_url),
  );
  const hadFullbody = Boolean(trimUrl(rowBefore.fullbody_url));
  const hasFullbody = Boolean(trimUrl(rowAfter.fullbody_url));

  return {
    portrait: hadPortrait && !hasPortrait,
    fullbody: hadFullbody && !hasFullbody,
  };
}

/** Retire les URLs Storage cassées d’une ligne profil (sans écriture BDD). */
export function stripBrokenProfilePhotoUrlsFromRow(
  row: Record<string, unknown>,
  brokenUrls: ReadonlySet<string>,
): { row: Record<string, unknown>; clearedFields: ProfilePhotoUrlField[] } {
  const next: Record<string, unknown> = { ...row };
  const clearedFields: ProfilePhotoUrlField[] = [];

  for (const field of PROFILE_PHOTO_URL_FIELDS) {
    const url = trimUrl(next[field]);
    if (!url || !brokenUrls.has(url)) continue;
    next[field] = null;
    clearedFields.push(field);
  }

  const portrait = trimUrl(next.portrait_url);
  const fullbody = trimUrl(next.fullbody_url);
  const main = trimUrl(next.main_photo_url);
  const avatar = trimUrl(next.avatar_url);

  if (main && brokenUrls.has(main)) {
    next.main_photo_url = portrait || fullbody || null;
    if (!clearedFields.includes("main_photo_url")) clearedFields.push("main_photo_url");
  }
  if (avatar && brokenUrls.has(avatar)) {
    next.avatar_url = portrait || null;
    if (!clearedFields.includes("avatar_url")) clearedFields.push("avatar_url");
  }

  if (!trimUrl(next.portrait_url) && !trimUrl(next.fullbody_url)) {
    if (trimUrl(next.main_photo_url)) {
      next.main_photo_url = null;
      if (!clearedFields.includes("main_photo_url")) clearedFields.push("main_photo_url");
    }
    if (trimUrl(next.avatar_url)) {
      next.avatar_url = null;
      if (!clearedFields.includes("avatar_url")) clearedFields.push("avatar_url");
    }
  } else if (!trimUrl(next.portrait_url)) {
    next.main_photo_url = fullbody || null;
    next.avatar_url = null;
  } else {
    next.main_photo_url = portrait || fullbody || null;
    if (!trimUrl(next.avatar_url)) next.avatar_url = portrait;
  }

  return { row: next, clearedFields };
}

/**
 * Sonde les URLs `profile-photos`, nettoie la ligne profil et persiste les null en BDD.
 * Ne retourne des URLs valides qu’après vérification Storage.
 */
export async function reconcileBrokenProfilePhotoUrlsForUser(
  supabase: SupabaseClient,
  userId: string,
  row: Record<string, unknown>,
): Promise<BrokenProfilePhotoReconcileResult> {
  const brokenUrls = new Set<string>();

  const urls = collectProfilePhotoUrlsFromRow(row).filter(isProfilePhotosStoragePublicUrl);
  await Promise.all(
    urls.map(async (url) => {
      const health = await probeProfilePhotoStorageHealth(url);
      if (health.broken) brokenUrls.add(url);
    }),
  );

  if (brokenUrls.size === 0) {
    return {
      row,
      clearedFields: [],
      brokenUrls: [],
      changed: false,
      reuploadSlots: { portrait: false, fullbody: false },
    };
  }

  const stripped = stripBrokenProfilePhotoUrlsFromRow(row, brokenUrls);
  const reuploadSlots = computeReuploadSlots(row, stripped.row);

  const payload: Record<string, unknown> = {
    id: userId,
    updated_at: new Date().toISOString(),
  };
  for (const field of PROFILE_PHOTO_URL_FIELDS) {
    const before = trimUrl(row[field]);
    const after = trimUrl(stripped.row[field]);
    if (before !== after) {
      payload[field] = after;
    }
  }

  const changed = Object.keys(payload).length > 2;
  if (changed) {
    const { error } = await supabase.from("profiles").update(payload).eq("id", userId);
    if (error) {
      console.error("[profilePhoto] broken_url_db_clear_failed", {
        userId,
        message: error.message,
        clearedFields: stripped.clearedFields,
      });
    } else {
      console.log("[profilePhoto] broken_urls_cleared_from_db", {
        userId,
        clearedFields: stripped.clearedFields,
        brokenUrlCount: brokenUrls.size,
        reuploadSlots,
      });
      markBrokenProfilePhotoReuploadSlots(userId, reuploadSlots);
    }
  }

  return {
    row: stripped.row,
    clearedFields: stripped.clearedFields,
    brokenUrls: [...brokenUrls],
    changed,
    reuploadSlots,
  };
}
