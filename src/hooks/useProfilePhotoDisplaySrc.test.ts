import { beforeEach, describe, expect, it, vi } from "vitest";

const getProfilePhotoSignedUrl = vi.fn();
const buildSyncProfilePhotoDisplayCandidates = vi.fn();
const normalizeProfilePhotoStoredRef = vi.fn();
const shouldPassThroughProfilePhotoDisplayUrl = vi.fn();

vi.mock("../lib/profilePhotoSignedUrl", () => ({
  getProfilePhotoSignedUrl: (...args: unknown[]) => getProfilePhotoSignedUrl(...args),
  shouldPassThroughProfilePhotoDisplayUrl: (...args: unknown[]) =>
    shouldPassThroughProfilePhotoDisplayUrl(...args),
  filterProfilePhotoDisplayUrls: (urls: string[]) => urls,
  profilePhotoObjectPathFromStoredValue: () => "user-1/portrait-1.jpg",
  isProfilePhotosPublicStorageUrl: () => false,
}));

vi.mock("../lib/profilePhotoDisplayUrl", () => ({
  buildSyncProfilePhotoDisplayCandidates: (...args: unknown[]) =>
    buildSyncProfilePhotoDisplayCandidates(...args),
  buildSyncProfilePhotoDisplaySrc: vi.fn(() => null),
  pickPrimaryProfilePhotoStoredRef: vi.fn(),
  pickSecondaryProfilePhotoStoredRef: vi.fn(),
  skipSyncPublicProfilePhotoUrl: vi.fn(() => true),
}));

vi.mock("../lib/profilePhotoUpload", () => ({
  normalizeProfilePhotoStoredRef: (...args: unknown[]) => normalizeProfilePhotoStoredRef(...args),
}));

vi.mock("../lib/supabase", () => ({
  supabase: { tag: "test-supabase-client" },
}));

const STORAGE_PUBLIC_REF =
  "https://example.supabase.co/storage/v1/object/public/profile-photos/user-1/portrait-1.jpg";
const SIGNED_DISPLAY_URL =
  "https://example.supabase.co/storage/v1/object/sign/profile-photos/user-1/portrait-1.jpg?token=abc";

const { resolveProfilePhotoStoredRefDisplayUrls } = await import("./useProfilePhotoDisplaySrc");

describe("resolveProfilePhotoStoredRefDisplayUrls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildSyncProfilePhotoDisplayCandidates.mockReturnValue([]);
    normalizeProfilePhotoStoredRef.mockReturnValue(STORAGE_PUBLIC_REF);
    shouldPassThroughProfilePhotoDisplayUrl.mockReturnValue(false);
    getProfilePhotoSignedUrl.mockResolvedValue(null);
  });

  it("bucket privé : signed URL en premier (pas d’URL publique sync)", async () => {
    getProfilePhotoSignedUrl
      .mockResolvedValueOnce(SIGNED_DISPLAY_URL)
      .mockResolvedValueOnce(`${SIGNED_DISPLAY_URL}&v=2`);

    const urls = await resolveProfilePhotoStoredRefDisplayUrls(STORAGE_PUBLIC_REF);

    expect(buildSyncProfilePhotoDisplayCandidates).not.toHaveBeenCalled();
    expect(getProfilePhotoSignedUrl).toHaveBeenCalledTimes(2);
    expect(getProfilePhotoSignedUrl).toHaveBeenNthCalledWith(
      1,
      { tag: "test-supabase-client" },
      STORAGE_PUBLIC_REF,
    );
    expect(getProfilePhotoSignedUrl).toHaveBeenNthCalledWith(
      2,
      { tag: "test-supabase-client" },
      STORAGE_PUBLIC_REF,
      3600,
    );
    expect(urls).toEqual([SIGNED_DISPLAY_URL, `${SIGNED_DISPLAY_URL}&v=2`]);
    expect(urls[0]).toMatch(/\/object\/sign\/profile-photos\//);
  });

  it("web : signed URL avant toute URL publique", async () => {
    getProfilePhotoSignedUrl.mockResolvedValue(SIGNED_DISPLAY_URL);

    const urls = await resolveProfilePhotoStoredRefDisplayUrls(STORAGE_PUBLIC_REF);

    expect(urls[0]).toBe(SIGNED_DISPLAY_URL);
    expect(getProfilePhotoSignedUrl).toHaveBeenCalled();
  });

  it("pass-through : ref déjà affichable sans sync → retourne la ref normalisée", async () => {
    const googleAvatar = "https://lh3.googleusercontent.com/a/avatar.jpg";
    normalizeProfilePhotoStoredRef.mockReturnValue(googleAvatar);
    shouldPassThroughProfilePhotoDisplayUrl.mockReturnValue(true);

    const urls = await resolveProfilePhotoStoredRefDisplayUrls(googleAvatar);

    expect(urls).toEqual([googleAvatar]);
    expect(getProfilePhotoSignedUrl).not.toHaveBeenCalled();
  });

  it("échec signing : aucune URL affichable → tableau vide (placeholder SPLove autorisé)", async () => {
    getProfilePhotoSignedUrl.mockResolvedValue(null);

    const urls = await resolveProfilePhotoStoredRefDisplayUrls(STORAGE_PUBLIC_REF);

    expect(getProfilePhotoSignedUrl).toHaveBeenCalledTimes(2);
    expect(urls).toEqual([]);
  });
});
