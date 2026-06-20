import type { SupabaseClient } from "@supabase/supabase-js";
import { PROFILE_PHOTOS_BUCKET } from "./profilePhotoSignedUrl";
import { PROFILE_PHOTO_JPEG_MIME } from "./profilePhotoNormalize";

export const PROFILE_PHOTO_UPLOAD_VERIFY_ERRORS = {
  EMPTY: "profile_photo_upload_empty",
  BAD_CONTENT_TYPE: "profile_photo_upload_bad_content_type",
  HEAD_FAILED: "profile_photo_upload_verify_failed",
} as const;

export type ProfilePhotoUploadVerifyResult =
  | {
      ok: true;
      httpStatus: number;
      contentLength: number;
      contentType: string;
    }
  | {
      ok: false;
      httpStatus: number | null;
      contentLength: number | null;
      contentType: string | null;
      error: string;
    };

export class ProfilePhotoUploadVerifyError extends Error {
  readonly code: string;
  readonly objectPath: string;
  readonly verify: ProfilePhotoUploadVerifyResult;

  constructor(code: string, objectPath: string, verify: ProfilePhotoUploadVerifyResult) {
    super(code);
    this.name = "ProfilePhotoUploadVerifyError";
    this.code = code;
    this.objectPath = objectPath;
    this.verify = verify;
  }
}

function parseContentLength(header: string | null): number | null {
  if (!header) return null;
  const n = Number.parseInt(header, 10);
  return Number.isFinite(n) ? n : null;
}

function isJpegContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return normalized === PROFILE_PHOTO_JPEG_MIME;
}

/** HEAD public URL — valide taille > 0 et MIME JPEG. */
export async function verifyUploadedProfilePhotoPublicUrl(
  publicUrl: string,
): Promise<ProfilePhotoUploadVerifyResult> {
  const url = publicUrl.trim();
  if (!url) {
    return {
      ok: false,
      httpStatus: null,
      contentLength: null,
      contentType: null,
      error: PROFILE_PHOTO_UPLOAD_VERIFY_ERRORS.HEAD_FAILED,
    };
  }

  try {
    const res = await fetch(url, { method: "HEAD" });
    const contentType = res.headers.get("content-type");
    const contentLength = parseContentLength(res.headers.get("content-length"));

    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        contentLength,
        contentType,
        error: PROFILE_PHOTO_UPLOAD_VERIFY_ERRORS.HEAD_FAILED,
      };
    }

    if (!contentLength || contentLength <= 0) {
      return {
        ok: false,
        httpStatus: res.status,
        contentLength,
        contentType,
        error: PROFILE_PHOTO_UPLOAD_VERIFY_ERRORS.EMPTY,
      };
    }

    if (!isJpegContentType(contentType)) {
      return {
        ok: false,
        httpStatus: res.status,
        contentLength,
        contentType,
        error: PROFILE_PHOTO_UPLOAD_VERIFY_ERRORS.BAD_CONTENT_TYPE,
      };
    }

    return {
      ok: true,
      httpStatus: res.status,
      contentLength,
      contentType: contentType ?? PROFILE_PHOTO_JPEG_MIME,
    };
  } catch {
    return {
      ok: false,
      httpStatus: null,
      contentLength: null,
      contentType: null,
      error: PROFILE_PHOTO_UPLOAD_VERIFY_ERRORS.HEAD_FAILED,
    };
  }
}

export async function removeBrokenProfilePhotoObject(
  supabase: SupabaseClient,
  objectPath: string,
): Promise<void> {
  const path = objectPath.trim();
  if (!path) return;
  try {
    await supabase.storage.from(PROFILE_PHOTOS_BUCKET).remove([path]);
  } catch (e) {
    console.warn("[profilePhoto] remove_broken_object_failed", {
      objectPath: path,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function assertProfilePhotoUploadVerified(
  supabase: SupabaseClient,
  objectPath: string,
  publicUrl: string,
): Promise<ProfilePhotoUploadVerifyResult & { ok: true }> {
  const verify = await verifyUploadedProfilePhotoPublicUrl(publicUrl);
  if (verify.ok) return verify;

  await removeBrokenProfilePhotoObject(supabase, objectPath);
  throw new ProfilePhotoUploadVerifyError(verify.error, objectPath, verify);
}
