import { photoUrlPrefix } from "./profilePhotoPipelineLog";

export const PROFILE_PHOTO_URL_FIELDS = [
  "main_photo_url",
  "portrait_url",
  "fullbody_url",
  "avatar_url",
] as const;

export type ProfilePhotoUrlField = (typeof PROFILE_PHOTO_URL_FIELDS)[number];

export type ProfilePhotoStorageHealth = {
  url: string;
  valid: boolean;
  broken: boolean;
  httpStatus: number | null;
  contentLength: number | null;
  contentType: string | null;
  reason: "ok" | "empty" | "octet_stream" | "head_failed" | "bad_content_type" | "not_storage_url";
};

const healthCache = new Map<string, ProfilePhotoStorageHealth>();

function trimUrl(value: unknown): string | null {
  const t = typeof value === "string" ? value.trim() : "";
  return t || null;
}

export function isProfilePhotosStoragePublicUrl(url: string | null | undefined): boolean {
  const t = trimUrl(url);
  if (!t) return false;
  return t.includes("/profile-photos/") || t.startsWith("profile-photos/");
}

function parseContentLength(header: string | null): number | null {
  if (!header) return null;
  const n = Number.parseInt(header, 10);
  return Number.isFinite(n) ? n : null;
}

/** Évalue une réponse HEAD Storage — 0 octet ou octet-stream = cassé. */
export function evaluateProfilePhotoStorageHead(
  httpStatus: number,
  contentType: string | null,
  contentLength: number | null,
): Pick<ProfilePhotoStorageHealth, "valid" | "broken" | "reason"> {
  if (httpStatus < 200 || httpStatus >= 300) {
    return { valid: false, broken: true, reason: "head_failed" };
  }

  const len = contentLength ?? 0;
  if (len <= 0) {
    return { valid: false, broken: true, reason: "empty" };
  }

  const ct = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (ct === "application/octet-stream") {
    return { valid: false, broken: true, reason: "octet_stream" };
  }

  if (ct.startsWith("image/")) {
    return { valid: true, broken: false, reason: "ok" };
  }

  return { valid: false, broken: true, reason: "bad_content_type" };
}

export function cacheProfilePhotoStorageHealth(health: ProfilePhotoStorageHealth): void {
  healthCache.set(health.url, health);
}

export function getCachedProfilePhotoStorageHealth(
  url: string | null | undefined,
): ProfilePhotoStorageHealth | null {
  const t = trimUrl(url);
  if (!t) return null;
  return healthCache.get(t) ?? null;
}

export function isKnownBrokenProfilePhotoUrl(url: string | null | undefined): boolean {
  const cached = getCachedProfilePhotoStorageHealth(url);
  return cached?.broken === true;
}

export function clearProfilePhotoStorageHealthCache(): void {
  healthCache.clear();
}

/** HEAD best-effort sur une URL publique `profile-photos`. */
export async function probeProfilePhotoStorageHealth(
  url: string,
): Promise<ProfilePhotoStorageHealth> {
  const trimmed = trimUrl(url);
  if (!trimmed) {
    return {
      url: "",
      valid: false,
      broken: true,
      httpStatus: null,
      contentLength: null,
      contentType: null,
      reason: "head_failed",
    };
  }

  const cached = healthCache.get(trimmed);
  if (cached) return cached;

  if (!isProfilePhotosStoragePublicUrl(trimmed)) {
    const health: ProfilePhotoStorageHealth = {
      url: trimmed,
      valid: true,
      broken: false,
      httpStatus: null,
      contentLength: null,
      contentType: null,
      reason: "not_storage_url",
    };
    healthCache.set(trimmed, health);
    return health;
  }

  try {
    const res = await fetch(trimmed.split("?")[0] ?? trimmed, { method: "HEAD" });
    const contentType = res.headers.get("content-type");
    const contentLength = parseContentLength(res.headers.get("content-length"));
    const evaluated = evaluateProfilePhotoStorageHead(res.status, contentType, contentLength);
    const health: ProfilePhotoStorageHealth = {
      url: trimmed,
      httpStatus: res.status,
      contentLength,
      contentType,
      ...evaluated,
    };
    healthCache.set(trimmed, health);
    if (health.broken) {
      console.warn("[profilePhoto] storage_health_broken", {
        url: photoUrlPrefix(trimmed),
        reason: health.reason,
        contentLength: health.contentLength,
        contentType: health.contentType,
      });
    }
    return health;
  } catch {
    const health: ProfilePhotoStorageHealth = {
      url: trimmed,
      valid: false,
      broken: true,
      httpStatus: null,
      contentLength: null,
      contentType: null,
      reason: "head_failed",
    };
    healthCache.set(trimmed, health);
    return health;
  }
}

export function collectProfilePhotoUrlsFromRow(
  row: Record<string, unknown> | null | undefined,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const field of PROFILE_PHOTO_URL_FIELDS) {
    const url = trimUrl(row?.[field]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
