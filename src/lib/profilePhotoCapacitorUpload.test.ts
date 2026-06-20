import { describe, expect, it } from "vitest";
import { arrayBufferToBase64 } from "./profilePhotoCapacitorUpload";

describe("arrayBufferToBase64", () => {
  it("encode un JPEG minimal", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const encoded = arrayBufferToBase64(bytes.buffer);
    expect(atob(encoded)).toBe("\xff\xd8\xff\xd9");
  });

  it("retourne chaîne vide pour buffer vide", () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe("");
  });
});
