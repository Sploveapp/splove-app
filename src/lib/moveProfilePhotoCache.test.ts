import { beforeEach, describe, expect, it, vi } from "vitest";

const getProfilePhotoSignedUrl = vi.fn();

vi.mock("./supabase", () => ({ supabase: {} }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" },
  CapacitorHttp: { get: vi.fn() },
}));
vi.mock("./capacitorImageDataUrl", () => ({
  shouldUseIosCapacitorImageFallback: () => false,
}));
vi.mock("./profilePhotoUpload", () => ({
  normalizeProfilePhotoStoredRef: (v: string) => v,
  buildProfilePhotoPublicUrl: () => "https://cdn.example/public.jpg",
}));
vi.mock("./profilePhotoSignedUrl", () => ({
  getProfilePhotoSignedUrl: (...args: unknown[]) => getProfilePhotoSignedUrl(...args),
  profilePhotoObjectPathFromStoredValue: () => "user/portrait.jpg",
  shouldPassThroughProfilePhotoDisplayUrl: () => false,
}));
vi.mock("./profilePhotoIosDisplayUrls", () => ({
  buildIosCapacitorImageFetchUrlCandidates: () => [],
}));

describe("moveProfilePhotoCache", () => {
  beforeEach(() => {
    vi.resetModules();
    getProfilePhotoSignedUrl.mockReset();
  });

  it("met en cache la signed URL et évite un second appel Supabase", async () => {
    getProfilePhotoSignedUrl.mockResolvedValue("https://cdn.example/signed.jpg");

    const mod = await import("./moveProfilePhotoCache");
    const ref = "https://cdn.example/stored.jpg";

    const first = await mod.getMoveProfilePhotoSignedUrlCached(ref);
    const second = await mod.getMoveProfilePhotoSignedUrlCached(ref);

    expect(first).toBe("https://cdn.example/signed.jpg");
    expect(second).toBe("https://cdn.example/signed.jpg");
    expect(getProfilePhotoSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("expose un displaySrc synchrone après ensureMoveProfilePhotoDisplay", async () => {
    getProfilePhotoSignedUrl.mockResolvedValue("https://cdn.example/signed.jpg");

    const mod = await import("./moveProfilePhotoCache");
    const ref = "https://cdn.example/stored.jpg";

    expect(mod.getMoveProfilePhotoDisplaySync(ref)).toBeNull();
    const src = await mod.ensureMoveProfilePhotoDisplay(ref);
    expect(src).toBe("https://cdn.example/public.jpg");
    expect(mod.getMoveProfilePhotoDisplaySync(ref)).toBe("https://cdn.example/public.jpg");
  });
});
