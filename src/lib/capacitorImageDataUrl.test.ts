import { describe, expect, it } from "vitest";
import {
  getCachedCapacitorImageDataUrl,
  isRemoteHttpImageUrl,
  shouldUseIosCapacitorImageFallback,
} from "./capacitorImageDataUrl";

describe("capacitorImageDataUrl", () => {
  it("isRemoteHttpImageUrl accepte https uniquement", () => {
    expect(isRemoteHttpImageUrl("https://x.supabase.co/photo.jpg")).toBe(true);
    expect(isRemoteHttpImageUrl("blob:https://localhost/x")).toBe(false);
    expect(isRemoteHttpImageUrl("data:image/jpeg;base64,abc")).toBe(false);
  });

  it("shouldUseIosCapacitorImageFallback est false en test vitest", () => {
    expect(shouldUseIosCapacitorImageFallback()).toBe(false);
  });

  it("getCachedCapacitorImageDataUrl retourne null si absent", () => {
    expect(getCachedCapacitorImageDataUrl("https://example.com/nope.jpg")).toBeNull();
  });
});
