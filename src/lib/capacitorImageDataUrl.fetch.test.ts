import { beforeEach, describe, expect, it, vi } from "vitest";

const capacitorHttpGet = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => "ios",
  },
  CapacitorHttp: {
    get: (...args: unknown[]) => capacitorHttpGet(...args),
  },
}));

function minimalJpegBytes(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

function jpegBase64(): string {
  const bytes = minimalJpegBytes();
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

describe("fetchCapacitorImageDataUrl", () => {
  beforeEach(async () => {
    capacitorHttpGet.mockReset();
    const { clearCapacitorImageDataUrlCache } = await import("./capacitorImageDataUrl");
    clearCapacitorImageDataUrlCache();
  });

  it("convertit une réponse base64 CapacitorHttp en data URL JPEG valide", async () => {
    const b64 = jpegBase64();
    capacitorHttpGet.mockResolvedValueOnce({
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
      data: b64,
    });

    const { fetchCapacitorImageDataUrl } = await import("./capacitorImageDataUrl");
    const result = await fetchCapacitorImageDataUrl("https://cdn.example/photo.jpg");
    expect(result).toBe(`data:image/jpeg;base64,${b64}`);
    expect(capacitorHttpGet).toHaveBeenCalledWith({
      url: "https://cdn.example/photo.jpg",
      responseType: "arraybuffer",
    });
  });

  it("essaie les fallback URLs si la première échoue", async () => {
    const b64 = jpegBase64();
    capacitorHttpGet
      .mockResolvedValueOnce({ status: 403, headers: {}, data: "" })
      .mockResolvedValueOnce({
        status: 200,
        headers: { "content-type": "image/jpeg" },
        data: b64,
      });

    const { fetchCapacitorImageDataUrl } = await import("./capacitorImageDataUrl");
    const result = await fetchCapacitorImageDataUrl("https://cdn.example/signed.jpg", [
      "https://cdn.example/public.jpg",
    ]);
    expect(result).toBe(`data:image/jpeg;base64,${b64}`);
    expect(capacitorHttpGet).toHaveBeenCalledTimes(2);
  });

  it("ne met pas en cache un payload corrompu", async () => {
    capacitorHttpGet.mockResolvedValueOnce({
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
      data: btoa("not-a-jpeg"),
    });

    const { fetchCapacitorImageDataUrl, getCachedCapacitorImageDataUrl } = await import(
      "./capacitorImageDataUrl"
    );
    const result = await fetchCapacitorImageDataUrl("https://cdn.example/bad.jpg");
    expect(result).toBeNull();
    expect(getCachedCapacitorImageDataUrl("https://cdn.example/bad.jpg")).toBeNull();
  });
});
