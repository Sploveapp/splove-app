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

describe("fetchCapacitorImageDataUrl", () => {
  beforeEach(() => {
    capacitorHttpGet.mockReset();
  });

  it("convertit une réponse base64 CapacitorHttp en data URL", async () => {
    capacitorHttpGet.mockResolvedValueOnce({
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
      data: "YWJj", // "abc"
    });

    const { fetchCapacitorImageDataUrl } = await import("./capacitorImageDataUrl");
    const result = await fetchCapacitorImageDataUrl("https://cdn.example/photo.jpg");
    expect(result).toBe("data:image/jpeg;base64,YWJj");
  });

  it("essaie les fallback URLs si la première échoue", async () => {
    capacitorHttpGet
      .mockResolvedValueOnce({ status: 403, headers: {}, data: "" })
      .mockResolvedValueOnce({
        status: 200,
        headers: { "content-type": "image/png" },
        data: "eA==",
      });

    const { fetchCapacitorImageDataUrl } = await import("./capacitorImageDataUrl");
    const result = await fetchCapacitorImageDataUrl("https://cdn.example/signed.jpg", [
      "https://cdn.example/public.jpg",
    ]);
    expect(result).toBe("data:image/png;base64,eA==");
    expect(capacitorHttpGet).toHaveBeenCalledTimes(2);
  });
});
