import { describe, expect, it } from "vitest";
import {
  bytesLookLikeJpeg,
  isValidCachedImageDataUrl,
  normalizeCapacitorImageResponseToDataUrl,
} from "./normalizeCapacitorImageResponseToDataUrl";

/** JPEG minimal (SOI + APP0 + EOI) — magic FF D8 FF. */
function minimalJpegBytes(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

function bytesToBinaryString(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
}

function uint8ToBase64(bytes: Uint8Array): string {
  return btoa(bytesToBinaryString(bytes));
}

describe("normalizeCapacitorImageResponseToDataUrl", () => {
  it("réutilise une Data URL déjà fournie sans réencodage", () => {
    const jpegB64 = uint8ToBase64(minimalJpegBytes());
    const input = `data:image/jpeg;base64,${jpegB64}`;
    const { dataUrl, meta } = normalizeCapacitorImageResponseToDataUrl(input, "image/jpeg");
    expect(meta.alreadyDataUrl).toBe(true);
    expect(meta.alreadyBase64).toBe(true);
    expect(meta.doubleEncodingCorrected).toBe(false);
    expect(dataUrl).toBe(`data:image/jpeg;base64,${jpegB64}`);
    expect(meta.firstBytesHex).toBe("FF D8 FF");
  });

  it("wrap une chaîne base64 déjà fournie sans btoa", () => {
    const jpegB64 = uint8ToBase64(minimalJpegBytes());
    expect(jpegB64.startsWith("/9j/")).toBe(true);
    const { dataUrl, meta } = normalizeCapacitorImageResponseToDataUrl(jpegB64, "image/jpeg");
    expect(meta.sourceDataType).toBe("base64_string");
    expect(meta.alreadyBase64).toBe(true);
    expect(meta.doubleEncodingCorrected).toBe(false);
    expect(dataUrl).toBe(`data:image/jpeg;base64,${jpegB64}`);
    expect(meta.firstBytesHex).toBe("FF D8 FF");
  });

  it("encode un ArrayBuffer JPEG une seule fois", () => {
    const bytes = minimalJpegBytes();
    const { dataUrl, meta } = normalizeCapacitorImageResponseToDataUrl(bytes.buffer, "image/jpeg");
    expect(meta.sourceDataType).toBe("array_buffer");
    expect(meta.alreadyBase64).toBe(false);
    expect(dataUrl).toBe(`data:image/jpeg;base64,${uint8ToBase64(bytes)}`);
    expect(meta.firstBytesHex).toBe("FF D8 FF");
    expect(bytesLookLikeJpeg(bytes)).toBe(true);
  });

  it("corrige le double encodage (base64-of-base64) vers un seul encode", () => {
    const jpegB64 = uint8ToBase64(minimalJpegBytes());
    const doubleEncoded = btoa(jpegB64);
    expect(doubleEncoded.startsWith("/9j/")).toBe(false);
    const { dataUrl, meta } = normalizeCapacitorImageResponseToDataUrl(doubleEncoded, "image/jpeg");
    expect(meta.doubleEncodingCorrected).toBe(true);
    expect(dataUrl).toBe(`data:image/jpeg;base64,${jpegB64}`);
    expect(meta.firstBytesHex).toBe("FF D8 FF");
  });

  it("refuse un payload corrompu", () => {
    const { dataUrl, meta } = normalizeCapacitorImageResponseToDataUrl("not!!!valid@@@", "image/jpeg");
    expect(dataUrl).toBeNull();
    expect(meta.sourceDataType).toBe("unknown");
  });

  it("refuse un base64 décodable mais non-JPEG quand mime=jpeg", () => {
    const junk = btoa("hello world not an image!!");
    const { dataUrl, meta } = normalizeCapacitorImageResponseToDataUrl(junk, "image/jpeg");
    expect(dataUrl).toBeNull();
    expect(meta.decodedByteLength).toBeGreaterThan(0);
    expect(meta.firstBytesHex).not.toBe("FF D8 FF");
  });

  it("accepte un JPEG valide commençant par FF D8 FF (chaîne binaire)", () => {
    const bytes = minimalJpegBytes();
    const binary = bytesToBinaryString(bytes);
    const { dataUrl, meta } = normalizeCapacitorImageResponseToDataUrl(binary, "image/jpeg");
    expect(meta.sourceDataType).toBe("binary_string");
    expect(dataUrl).toBe(`data:image/jpeg;base64,${uint8ToBase64(bytes)}`);
    expect(meta.firstBytesHex).toBe("FF D8 FF");
  });

  it("isValidCachedImageDataUrl exige /9j/ + magic FF D8 FF", () => {
    const jpegB64 = uint8ToBase64(minimalJpegBytes());
    expect(isValidCachedImageDataUrl(`data:image/jpeg;base64,${jpegB64}`)).toBe(true);
    expect(isValidCachedImageDataUrl(`data:image/jpeg;base64,${btoa("nope")}`)).toBe(false);
    expect(isValidCachedImageDataUrl("https://example.com/x.jpg")).toBe(false);
  });

  it("strip les newlines base64 (Android Base64.DEFAULT)", () => {
    const jpegB64 = uint8ToBase64(minimalJpegBytes());
    const withNewlines = jpegB64.replace(/(.{8})/g, "$1\n");
    const { dataUrl, meta } = normalizeCapacitorImageResponseToDataUrl(withNewlines, "image/jpeg");
    expect(dataUrl).toBe(`data:image/jpeg;base64,${jpegB64}`);
    expect(meta.firstBytesHex).toBe("FF D8 FF");
  });
});
