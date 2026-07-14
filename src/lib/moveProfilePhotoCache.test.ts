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

  it("expose un displaySrc synchrone après ensureMoveProfilePhotoDisplay (clé profile.id)", async () => {
    getProfilePhotoSignedUrl.mockResolvedValue("https://cdn.example/signed.jpg");

    const mod = await import("./moveProfilePhotoCache");
    const ref = "https://cdn.example/stored.jpg";
    const profileId = "98197128-aaaa-bbbb-cccc-ddddeeeeffff";

    expect(mod.getMoveProfilePhotoDisplaySync(ref, profileId)).toBeNull();
    const src = await mod.ensureMoveProfilePhotoDisplay(ref, { profileId });
    expect(src).toBe("https://cdn.example/signed.jpg");
    expect(mod.getMoveProfilePhotoDisplaySync(ref, profileId)).toBe("https://cdn.example/signed.jpg");
    expect(mod.getMoveProfilePhotoDisplaySync(ref, "other-profile-id")).toBeNull();
  });

  it("indexe le display cache par profile.id + ref", async () => {
    getProfilePhotoSignedUrl.mockResolvedValue("https://cdn.example/signed-a.jpg");

    const mod = await import("./moveProfilePhotoCache");
    const ref = "https://cdn.example/stored.jpg";
    const lindaId = "98197128-1111-2222-3333-444455556666";
    const otherId = "7fcc9bca-1111-2222-3333-444455556666";

    await mod.ensureMoveProfilePhotoDisplay(ref, { profileId: lindaId });
    expect(mod.moveProfilePhotoDisplayCacheKey(lindaId, ref)).toContain(lindaId);
    expect(mod.getMoveProfilePhotoDisplaySync(ref, lindaId)).toBeTruthy();
    expect(mod.getMoveProfilePhotoDisplaySync(ref, otherId)).toBeNull();
  });
});
