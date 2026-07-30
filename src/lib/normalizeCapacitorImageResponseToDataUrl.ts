/** Helpers : CapacitorHttp `response.data` → data URL image (une seule conversion base64). */

const BASE64_ALPHABET_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export type CapacitorImageResponseDataType =
  | "null"
  | "data_url"
  | "base64_string"
  | "binary_string"
  | "array_buffer"
  | "array_buffer_view"
  | "number_array"
  | "blob"
  | "unknown";

export type NormalizeCapacitorImageMeta = {
  sourceDataType: CapacitorImageResponseDataType;
  alreadyBase64: boolean;
  alreadyDataUrl: boolean;
  mime: string;
  base64Length: number | null;
  decodedByteLength: number | null;
  firstBytesHex: string | null;
  /** true si double-encodage détecté et corrigé vers octets image. */
  doubleEncodingCorrected: boolean;
};

export type ProfilePhotoDataUrlValidationAudit = {
  sourceDataType: CapacitorImageResponseDataType;
  alreadyBase64: boolean;
  alreadyDataUrl: boolean;
  mime: string;
  base64Length: number | null;
  decodedByteLength: number | null;
  firstBytesHex: string | null;
  imageDecodeOk: boolean;
  naturalWidth: number | null;
  naturalHeight: number | null;
};

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function bytesFromBinaryString(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) {
    out[i] = s.charCodeAt(i) & 0xff;
  }
  return out;
}

function stripBase64Whitespace(s: string): string {
  return s.replace(/\s+/g, "");
}

function isBase64Charset(s: string): boolean {
  if (!s || s.length < 8) return false;
  if (s.length % 4 !== 0) return false;
  return BASE64_ALPHABET_RE.test(s);
}

function tryAtobToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    return bytesFromBinaryString(bin);
  } catch {
    return null;
  }
}

function firstBytesHex(bytes: Uint8Array, n = 3): string | null {
  if (!bytes.length) return null;
  const take = Math.min(n, bytes.length);
  const parts: string[] = [];
  for (let i = 0; i < take; i += 1) {
    parts.push(bytes[i]!.toString(16).padStart(2, "0").toUpperCase());
  }
  return parts.join(" ");
}

/** JPEG SOI : FF D8 FF */
export function bytesLookLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function bytesLookLikePng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function asciiLooksLikeBase64Payload(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  let sample = "";
  const n = Math.min(bytes.length, 64);
  for (let i = 0; i < n; i += 1) {
    const c = bytes[i]!;
    if (c < 0x20 || c > 0x7e) return false;
    sample += String.fromCharCode(c);
  }
  const cleaned = stripBase64Whitespace(sample);
  return cleaned.startsWith("/9j/") || cleaned.startsWith("iVBOR") || isBase64Charset(cleaned + "====".slice(0, (4 - (cleaned.length % 4)) % 4));
}

function parseDataUrl(raw: string): { mime: string; base64: string } | null {
  const m = raw.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,([\s\S]+)$/i);
  if (!m) return null;
  const mime = (m[1] || "image/jpeg").trim() || "image/jpeg";
  const base64 = stripBase64Whitespace(m[2] || "");
  if (!base64) return null;
  return { mime, base64 };
}

function resolveMime(preferred: string | undefined, bytes: Uint8Array): string {
  const p = (preferred || "").split(";")[0]?.trim().toLowerCase() || "";
  if (p.startsWith("image/")) return p;
  if (bytesLookLikePng(bytes)) return "image/png";
  if (bytesLookLikeJpeg(bytes)) return "image/jpeg";
  return p || "image/jpeg";
}

function emptyMeta(mime: string): NormalizeCapacitorImageMeta {
  return {
    sourceDataType: "null",
    alreadyBase64: false,
    alreadyDataUrl: false,
    mime,
    base64Length: null,
    decodedByteLength: null,
    firstBytesHex: null,
    doubleEncodingCorrected: false,
  };
}

/**
 * Convertit `response.data` CapacitorHttp en `data:${mime};base64,…` **une seule fois**.
 * - Data URL déjà formée → réutilise le payload (whitespace strip), sans réencodage.
 * - Chaîne base64 → wrap sans `btoa`.
 * - Double encodage (base64-of-base64) → décode jusqu’aux octets image, puis un seul `btoa`.
 * - ArrayBuffer / bytes / chaîne binaire → un seul `btoa`.
 */
export function normalizeCapacitorImageResponseToDataUrl(
  responseData: unknown,
  mimeHint = "image/jpeg",
): { dataUrl: string | null; meta: NormalizeCapacitorImageMeta } {
  const hint = (mimeHint || "image/jpeg").split(";")[0]?.trim() || "image/jpeg";

  if (responseData == null) {
    return { dataUrl: null, meta: emptyMeta(hint) };
  }

  if (typeof Blob !== "undefined" && responseData instanceof Blob) {
    return {
      dataUrl: null,
      meta: { ...emptyMeta(hint), sourceDataType: "blob" },
    };
  }

  if (typeof responseData === "string") {
    const trimmed = responseData.trim();
    if (!trimmed) {
      return { dataUrl: null, meta: { ...emptyMeta(hint), sourceDataType: "base64_string" } };
    }

    if (trimmed.startsWith("data:")) {
      const parsed = parseDataUrl(trimmed);
      if (!parsed) {
        return {
          dataUrl: null,
          meta: { ...emptyMeta(hint), sourceDataType: "data_url", alreadyDataUrl: true },
        };
      }
      return finalizeFromBase64OrRaw(parsed.base64, parsed.mime, {
        sourceDataType: "data_url",
        alreadyBase64: true,
        alreadyDataUrl: true,
      });
    }

    if (trimmed.startsWith("{") || trimmed.startsWith("<") || trimmed.startsWith("[")) {
      return {
        dataUrl: null,
        meta: { ...emptyMeta(hint), sourceDataType: "unknown" },
      };
    }

    // Chaîne binaire (octets via charCode) — ex. JPEG brut passé en string.
    if (
      trimmed.length >= 3 &&
      trimmed.charCodeAt(0) === 0xff &&
      trimmed.charCodeAt(1) === 0xd8 &&
      trimmed.charCodeAt(2) === 0xff
    ) {
      const bytes = bytesFromBinaryString(trimmed);
      const mime = resolveMime(hint, bytes);
      const b64 = uint8ToBase64(bytes);
      return {
        dataUrl: `data:${mime};base64,${b64}`,
        meta: {
          sourceDataType: "binary_string",
          alreadyBase64: false,
          alreadyDataUrl: false,
          mime,
          base64Length: b64.length,
          decodedByteLength: bytes.length,
          firstBytesHex: firstBytesHex(bytes),
          doubleEncodingCorrected: false,
        },
      };
    }

    const cleaned = stripBase64Whitespace(trimmed);
    if (!isBase64Charset(cleaned)) {
      return {
        dataUrl: null,
        meta: { ...emptyMeta(hint), sourceDataType: "unknown" },
      };
    }

    return finalizeFromBase64OrRaw(cleaned, hint, {
      sourceDataType: "base64_string",
      alreadyBase64: true,
      alreadyDataUrl: false,
    });
  }

  if (responseData instanceof ArrayBuffer) {
    if (!responseData.byteLength) {
      return { dataUrl: null, meta: { ...emptyMeta(hint), sourceDataType: "array_buffer" } };
    }
    const bytes = new Uint8Array(responseData);
    return finalizeFromRawBytes(bytes, hint, "array_buffer");
  }

  if (ArrayBuffer.isView(responseData)) {
    const view = responseData as ArrayBufferView;
    if (!view.byteLength) {
      return { dataUrl: null, meta: { ...emptyMeta(hint), sourceDataType: "array_buffer_view" } };
    }
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    return finalizeFromRawBytes(bytes, hint, "array_buffer_view");
  }

  if (Array.isArray(responseData) && responseData.every((x) => typeof x === "number")) {
    const bytes = Uint8Array.from(responseData as number[]);
    if (!bytes.length) {
      return { dataUrl: null, meta: { ...emptyMeta(hint), sourceDataType: "number_array" } };
    }
    return finalizeFromRawBytes(bytes, hint, "number_array");
  }

  return { dataUrl: null, meta: { ...emptyMeta(hint), sourceDataType: "unknown" } };
}

function finalizeFromRawBytes(
  bytes: Uint8Array,
  mimeHint: string,
  sourceDataType: CapacitorImageResponseDataType,
): { dataUrl: string | null; meta: NormalizeCapacitorImageMeta } {
  const mime = resolveMime(mimeHint, bytes);
  if (mime.includes("jpeg") || mime.includes("jpg") || bytesLookLikeJpeg(bytes)) {
    if (!bytesLookLikeJpeg(bytes)) {
      return {
        dataUrl: null,
        meta: {
          sourceDataType,
          alreadyBase64: false,
          alreadyDataUrl: false,
          mime,
          base64Length: null,
          decodedByteLength: bytes.length,
          firstBytesHex: firstBytesHex(bytes),
          doubleEncodingCorrected: false,
        },
      };
    }
  }
  const b64 = uint8ToBase64(bytes);
  return {
    dataUrl: `data:${mime};base64,${b64}`,
    meta: {
      sourceDataType,
      alreadyBase64: false,
      alreadyDataUrl: false,
      mime,
      base64Length: b64.length,
      decodedByteLength: bytes.length,
      firstBytesHex: firstBytesHex(bytes),
      doubleEncodingCorrected: false,
    },
  };
}

function finalizeFromBase64OrRaw(
  base64Raw: string,
  mimeHint: string,
  flags: Pick<NormalizeCapacitorImageMeta, "sourceDataType" | "alreadyBase64" | "alreadyDataUrl">,
): { dataUrl: string | null; meta: NormalizeCapacitorImageMeta } {
  const cleaned = stripBase64Whitespace(base64Raw);
  const decoded = tryAtobToBytes(cleaned);
  if (!decoded || !decoded.length) {
    return {
      dataUrl: null,
      meta: {
        ...flags,
        mime: mimeHint,
        base64Length: cleaned.length,
        decodedByteLength: null,
        firstBytesHex: null,
        doubleEncodingCorrected: false,
      },
    };
  }

  // Double encodage : atob → texte base64 → atob → JPEG.
  if (asciiLooksLikeBase64Payload(decoded) && !bytesLookLikeJpeg(decoded) && !bytesLookLikePng(decoded)) {
    const innerText = Array.from(decoded, (b) => String.fromCharCode(b)).join("");
    const innerB64 = stripBase64Whitespace(innerText);
    const innerBytes = tryAtobToBytes(innerB64);
    if (innerBytes && (bytesLookLikeJpeg(innerBytes) || bytesLookLikePng(innerBytes))) {
      const mime = resolveMime(mimeHint, innerBytes);
      const b64 = uint8ToBase64(innerBytes);
      return {
        dataUrl: `data:${mime};base64,${b64}`,
        meta: {
          ...flags,
          alreadyBase64: false,
          mime,
          base64Length: b64.length,
          decodedByteLength: innerBytes.length,
          firstBytesHex: firstBytesHex(innerBytes),
          doubleEncodingCorrected: true,
        },
      };
    }
  }

  const mime = resolveMime(mimeHint, decoded);
  if ((mime.includes("jpeg") || mime.includes("jpg")) && !bytesLookLikeJpeg(decoded)) {
    return {
      dataUrl: null,
      meta: {
        ...flags,
        mime,
        base64Length: cleaned.length,
        decodedByteLength: decoded.length,
        firstBytesHex: firstBytesHex(decoded),
        doubleEncodingCorrected: false,
      },
    };
  }

  // Base64 déjà correct (préfixe /9j/ + magic OK) → wrap sans btoa.
  return {
    dataUrl: `data:${mime};base64,${cleaned}`,
    meta: {
      ...flags,
      mime,
      base64Length: cleaned.length,
      decodedByteLength: decoded.length,
      firstBytesHex: firstBytesHex(decoded),
      doubleEncodingCorrected: false,
    },
  };
}

/** Validation synchrone (magic + atob) — pour cache / rejet rapide. */
export function isValidCachedImageDataUrl(dataUrl: string | null | undefined): boolean {
  const t = typeof dataUrl === "string" ? dataUrl.trim() : "";
  if (!t.startsWith("data:")) return false;
  const parsed = parseDataUrl(t);
  if (!parsed) return false;
  if (parsed.mime.includes("jpeg") || parsed.mime.includes("jpg")) {
    if (!parsed.base64.startsWith("/9j/")) return false;
  }
  const bytes = tryAtobToBytes(parsed.base64);
  if (!bytes || !bytes.length) return false;
  if (parsed.mime.includes("jpeg") || parsed.mime.includes("jpg")) {
    return bytesLookLikeJpeg(bytes);
  }
  if (parsed.mime.includes("png")) return bytesLookLikePng(bytes);
  return bytesLookLikeJpeg(bytes) || bytesLookLikePng(bytes);
}

/**
 * Décode via `new Image()` — obligatoire avant mise en cache.
 * naturalWidth > 0 requis.
 */
export function validateDataUrlWithImage(
  dataUrl: string,
): Promise<{ imageDecodeOk: boolean; naturalWidth: number; naturalHeight: number }> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve({ imageDecodeOk: false, naturalWidth: 0, naturalHeight: 0 });
      return;
    }
    const img = new Image();
    const done = (ok: boolean) => {
      resolve({
        imageDecodeOk: ok && img.naturalWidth > 0 && img.naturalHeight > 0,
        naturalWidth: img.naturalWidth || 0,
        naturalHeight: img.naturalHeight || 0,
      });
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    try {
      img.src = dataUrl;
    } catch {
      done(false);
    }
  });
}

export function logProfilePhotoDataUrlValidation(audit: ProfilePhotoDataUrlValidationAudit): void {
  console.log("[PROFILE_PHOTO_DATA_URL_VALIDATION]", audit);
}

/**
 * Normalise + valide (magic + Image) avant cache.
 * Ne retourne une data URL que si décodable (naturalWidth > 0).
 */
export async function normalizeAndValidateCapacitorImageResponseToDataUrl(
  responseData: unknown,
  mimeHint = "image/jpeg",
): Promise<string | null> {
  const { dataUrl, meta } = normalizeCapacitorImageResponseToDataUrl(responseData, mimeHint);
  if (!dataUrl || !isValidCachedImageDataUrl(dataUrl)) {
    logProfilePhotoDataUrlValidation({
      sourceDataType: meta.sourceDataType,
      alreadyBase64: meta.alreadyBase64,
      alreadyDataUrl: meta.alreadyDataUrl,
      mime: meta.mime,
      base64Length: meta.base64Length,
      decodedByteLength: meta.decodedByteLength,
      firstBytesHex: meta.firstBytesHex,
      imageDecodeOk: false,
      naturalWidth: null,
      naturalHeight: null,
    });
    return null;
  }

  const decoded = await validateDataUrlWithImage(dataUrl);
  // Vitest/Node : pas d’`Image` — la validation magic/atob suffit pour les tests unitaires.
  // Sur iOS WKWebView, `Image` existe : onload + naturalWidth > 0 obligatoires avant cache.
  const imageOk =
    typeof Image !== "undefined"
      ? decoded.imageDecodeOk
      : isValidCachedImageDataUrl(dataUrl);

  logProfilePhotoDataUrlValidation({
    sourceDataType: meta.sourceDataType,
    alreadyBase64: meta.alreadyBase64,
    alreadyDataUrl: meta.alreadyDataUrl,
    mime: meta.mime,
    base64Length: meta.base64Length,
    decodedByteLength: meta.decodedByteLength,
    firstBytesHex: meta.firstBytesHex,
    imageDecodeOk: imageOk,
    naturalWidth: typeof Image !== "undefined" ? decoded.naturalWidth : imageOk ? 1 : 0,
    naturalHeight: typeof Image !== "undefined" ? decoded.naturalHeight : imageOk ? 1 : 0,
  });

  if (!imageOk) return null;
  return dataUrl;
}
