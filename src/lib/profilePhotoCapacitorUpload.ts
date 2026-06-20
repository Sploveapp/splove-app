import { CapacitorHttp } from "@capacitor/core";
import { env } from "./env";
import { PROFILE_PHOTOS_BUCKET } from "./profilePhotoSignedUrl";
import { PROFILE_PHOTO_JPEG_MIME } from "./profilePhotoNormalize";

const UPLOAD_TIMEOUT_MS = 60_000;

/** Encode binaire → base64 pour CapacitorHttp (`dataType: "file"`). */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) return "";
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function buildStorageObjectUploadUrl(objectPath: string): string {
  const base = env.supabaseUrl?.replace(/\/$/, "");
  if (!base) throw new Error("supabase_env_missing");
  const encodedPath = objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/storage/v1/object/${PROFILE_PHOTOS_BUCKET}/${encodedPath}`;
}

/**
 * Upload JPEG brut via CapacitorHttp (iOS/Android) — évite FormData/Blob cassé par capacitorFetch.
 * `data` = base64, `dataType` = "file", Content-Type forcé image/jpeg.
 */
export async function uploadProfilePhotoJpegViaCapacitorHttp(
  accessToken: string,
  objectPath: string,
  jpegBytes: ArrayBuffer,
  contentType: string = PROFILE_PHOTO_JPEG_MIME,
): Promise<{ status: number; byteLength: number }> {
  const anonKey = env.supabaseAnonKey;
  if (!anonKey?.trim()) throw new Error("supabase_env_missing");
  if (!accessToken?.trim()) throw new Error("auth_session_required");
  if (!(jpegBytes instanceof ArrayBuffer) || jpegBytes.byteLength <= 0) {
    throw new Error("profile_photo_upload_empty_body");
  }

  const url = buildStorageObjectUploadUrl(objectPath);
  const base64 = arrayBufferToBase64(jpegBytes);

  const response = await Promise.race([
    CapacitorHttp.request({
      url,
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        "Content-Type": contentType,
        "cache-control": "max-age=3600",
        "x-upsert": "true",
      },
      data: base64,
      dataType: "file",
    }),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("profile_photo_upload_timeout")), UPLOAD_TIMEOUT_MS);
    }),
  ]);

  const status = response.status;
  if (status < 200 || status >= 300) {
    const detail =
      typeof response.data === "string"
        ? response.data.slice(0, 200)
        : JSON.stringify(response.data ?? "").slice(0, 200);
    console.error("[profilePhoto] capacitor_upload_http_error", {
      status,
      objectPath,
      detail,
    });
    throw new Error(`profile_photo_upload_http_${status}`);
  }

  return { status, byteLength: jpegBytes.byteLength };
}
