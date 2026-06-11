/** Qualité JPEG cible pour Supabase / WKWebView (évite HEIC et formats iOS non décodables). */
export const PROFILE_PHOTO_JPEG_QUALITY = 0.85 as const;
export const PROFILE_PHOTO_JPEG_MIME = "image/jpeg" as const;
export const PROFILE_PHOTO_JPEG_EXT = "jpg" as const;

/** Nom de fichier sûr avec extension `.jpg`. */
export function buildNormalizedProfilePhotoFileName(originalName: string): string {
  const trimmed = typeof originalName === "string" ? originalName.trim() : "";
  const withoutExt = trimmed.replace(/\.[^./\\]+$/, "");
  const base =
    withoutExt
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 96) || "profile_photo";
  return `${base}.${PROFILE_PHOTO_JPEG_EXT}`;
}

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup?: () => void;
};

async function decodeImageFile(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => bitmap.close(),
        };
      }
      bitmap.close();
    } catch {
      // Repli HTMLImageElement ci-dessous.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("image_decode_failed"));
      image.src = url;
    });
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) throw new Error("image_decode_failed");
    return {
      source: img,
      width,
      height,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function encodeCanvasJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(source, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), PROFILE_PHOTO_JPEG_MIME, PROFILE_PHOTO_JPEG_QUALITY);
  });
  if (!blob) throw new Error("jpeg_encode_failed");
  return blob;
}

/**
 * Convertit toute photo sélectionnée (HEIC, PNG, WebP, JPEG mal étiqueté) en JPEG web-compatible.
 * Applique l’orientation EXIF via `createImageBitmap` quand disponible.
 */
export async function normalizeProfilePhotoForUpload(file: File): Promise<File> {
  if (!(file instanceof File)) throw new Error("invalid_file");
  if (file.size <= 0) throw new Error("empty_file");

  const decoded = await decodeImageFile(file);
  try {
    const blob = await encodeCanvasJpeg(decoded.source, decoded.width, decoded.height);
    return new File([blob], buildNormalizedProfilePhotoFileName(file.name), {
      type: PROFILE_PHOTO_JPEG_MIME,
      lastModified: Date.now(),
    });
  } finally {
    decoded.cleanup?.();
  }
}
