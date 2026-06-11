import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeProfileScreenRowPreservingPhotos } from "./profileScreenHydrate";
import {
  assertValidatedProfileHasCanonicalPhotoUrl,
  buildOnboardingPhotoUpsertPayload,
  mergeOnboardingPhotosIntoProfileRow,
  pickCanonicalPhotoStoredRef,
  profileRowHasCanonicalPhotos,
} from "./onboardingProfilePhotos";
import { hasProfilePhotosModerationValidated } from "./profileVerification";
import { pickPrimaryProfilePhotoStoredRef } from "./profilePhotoDisplayUrl";

const getProfilePhotoSignedUrl = vi.fn();
const buildSyncProfilePhotoDisplayCandidates = vi.fn();
const normalizeProfilePhotoStoredRef = vi.fn();
const shouldPassThroughProfilePhotoDisplayUrl = vi.fn();

vi.mock("./profilePhotoSignedUrl", () => ({
  getProfilePhotoSignedUrl: (...args: unknown[]) => getProfilePhotoSignedUrl(...args),
  shouldPassThroughProfilePhotoDisplayUrl: (...args: unknown[]) =>
    shouldPassThroughProfilePhotoDisplayUrl(...args),
}));

vi.mock("./profilePhotoDisplayUrl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./profilePhotoDisplayUrl")>();
  return {
    ...actual,
    buildSyncProfilePhotoDisplayCandidates: (...args: unknown[]) =>
      buildSyncProfilePhotoDisplayCandidates(...args),
    skipSyncPublicProfilePhotoUrl: vi.fn(() => true),
  };
});

vi.mock("./profilePhotoUpload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./profilePhotoUpload")>();
  return {
    ...actual,
    normalizeProfilePhotoStoredRef: (...args: unknown[]) =>
      normalizeProfilePhotoStoredRef(...args),
  };
});

const { resolveProfilePhotoStoredRefDisplayUrls } = await import(
  "../hooks/useProfilePhotoDisplaySrc"
);

const USER_ID = "linda-test-user-uuid";
const PORTRAIT_PUBLIC =
  "https://example.supabase.co/storage/v1/object/public/profile-photos/linda-test-user-uuid/portrait_1.jpg";
const FULLBODY_PUBLIC =
  "https://example.supabase.co/storage/v1/object/public/profile-photos/linda-test-user-uuid/activity_1.jpg";
const SIGNED_PORTRAIT =
  "https://example.supabase.co/storage/v1/object/sign/profile-photos/linda-test-user-uuid/portrait_1.jpg?token=abc";

function mockSupabaseForPublicUrls(): SupabaseClient {
  return {
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://example.supabase.co/storage/v1/object/public/profile-photos/${path}`,
          },
        }),
      }),
    },
  } as unknown as SupabaseClient;
}

/** Simule upload Storage → URL publique canonique (étape onboarding). */
function simulatePhotoUpload(objectPath: string, supabase: SupabaseClient): string {
  return supabase.storage.from("profile-photos").getPublicUrl(objectPath).data.publicUrl;
}

/** Simule upsert + SELECT readback Supabase. */
function simulateDbUpsertAndReadback(
  store: Map<string, Record<string, unknown>>,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const id = String(payload.id);
  const prev = store.get(id) ?? {};
  const saved = { ...prev, ...payload };
  store.set(id, saved);
  return {
    id,
    portrait_url: saved.portrait_url ?? null,
    fullbody_url: saved.fullbody_url ?? null,
    main_photo_url: saved.main_photo_url ?? null,
    avatar_url: saved.avatar_url ?? null,
  };
}

/** Simule fetchProfileScreenFields (reload écran Profil). */
function simulateProfileScreenReload(
  store: Map<string, Record<string, unknown>>,
  userId: string,
): Record<string, unknown> | null {
  const row = store.get(userId);
  if (!row) return null;
  return {
    id: userId,
    portrait_url: row.portrait_url ?? null,
    fullbody_url: row.fullbody_url ?? null,
    main_photo_url: row.main_photo_url ?? null,
    avatar_url: row.avatar_url ?? null,
  };
}

describe("profilePhotoOnboardingRegression — nouveau compte → upload → save → reload → affichage", () => {
  const supabase = mockSupabaseForPublicUrls();
  let db: Map<string, Record<string, unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new Map();
    normalizeProfilePhotoStoredRef.mockImplementation((value: string | null | undefined) => {
      const s = typeof value === "string" ? value.trim() : "";
      return s;
    });
    buildSyncProfilePhotoDisplayCandidates.mockReturnValue([]);
    shouldPassThroughProfilePhotoDisplayUrl.mockReturnValue(false);
    getProfilePhotoSignedUrl.mockResolvedValue(SIGNED_PORTRAIT);
  });

  it("pipeline complet : URLs canoniques en BDD après save et URL affichable après reload (iOS signed)", async () => {
    const portraitUrl = simulatePhotoUpload(`${USER_ID}/portrait_1.jpg`, supabase);
    const fullbodyUrl = simulatePhotoUpload(`${USER_ID}/activity_1.jpg`, supabase);

    const upsertPayload = buildOnboardingPhotoUpsertPayload(
      USER_ID,
      portraitUrl,
      fullbodyUrl,
      supabase,
    );
    expect(upsertPayload).not.toBeNull();
    expect(profileRowHasCanonicalPhotos(upsertPayload)).toBe(true);

    const savedRow = simulateDbUpsertAndReadback(db, upsertPayload!);
    expect(pickCanonicalPhotoStoredRef(savedRow)).toBe(portraitUrl);
    expect(savedRow.main_photo_url).toBe(portraitUrl);
    expect(savedRow.portrait_url).toBe(portraitUrl);
    expect(savedRow.avatar_url).toBe(portraitUrl);
    expect(savedRow.fullbody_url).toBe(fullbodyUrl);

    const reloaded = simulateProfileScreenReload(db, USER_ID);
    expect(reloaded).not.toBeNull();
    expect(profileRowHasCanonicalPhotos(reloaded)).toBe(true);

    const authCacheStub: Record<string, unknown> = {
      id: USER_ID,
      first_name: "Linda",
      profile_completed: true,
      photo1_status: "approved",
      photo2_status: "approved",
    };
    const mergedProfile = mergeProfileScreenRowPreservingPhotos(authCacheStub, reloaded!);
    expect(pickPrimaryProfilePhotoStoredRef(mergedProfile)).toBe(portraitUrl);

    const storedRef = pickCanonicalPhotoStoredRef(mergedProfile);
    expect(storedRef).toBeTruthy();

    const displayUrls = await resolveProfilePhotoStoredRefDisplayUrls(storedRef!);
    expect(displayUrls.length).toBeGreaterThan(0);
    expect(displayUrls[0]).toMatch(/\/object\/sign\/profile-photos\//);

    assertValidatedProfileHasCanonicalPhotoUrl(mergedProfile);
  });

  it("échoue si photo validée (photo1 + photo2 approved) sans aucune URL canonique", () => {
    const validatedWithoutUrls: Record<string, unknown> = {
      id: USER_ID,
      photo1_status: "approved",
      photo2_status: "approved",
      photo_moderation_overall: "approved",
      profile_completed: true,
    };

    expect(hasProfilePhotosModerationValidated(validatedWithoutUrls)).toBe(true);
    expect(profileRowHasCanonicalPhotos(validatedWithoutUrls)).toBe(false);

    expect(() => assertValidatedProfileHasCanonicalPhotoUrl(validatedWithoutUrls)).toThrow(
      /REGRESSION: photo moderation validated but no canonical photo URL/,
    );
  });

  it("échoue si photo_status approved sans URL (cas Linda Test / placeholder modération)", () => {
    const row = {
      id: USER_ID,
      photo_status: "approved",
      main_photo_url: null,
      portrait_url: null,
      avatar_url: null,
      fullbody_url: null,
    };

    expect(hasProfilePhotosModerationValidated(row)).toBe(true);
    expect(() => assertValidatedProfileHasCanonicalPhotoUrl(row)).toThrow(/REGRESSION/);
  });

  it("merge onboarding réinjecte les URLs après un upsert sanitize qui les aurait retirées", () => {
    const portraitUrl = PORTRAIT_PUBLIC;
    const sanitizedPayload: Record<string, unknown> = {
      id: USER_ID,
      profile_completed: true,
      photo1_status: "approved",
      photo2_status: "approved",
    };

    const withPhotos = mergeOnboardingPhotosIntoProfileRow(
      sanitizedPayload,
      portraitUrl,
      FULLBODY_PUBLIC,
      supabase,
    );

    expect(profileRowHasCanonicalPhotos(withPhotos)).toBe(true);
    assertValidatedProfileHasCanonicalPhotoUrl(withPhotos);
  });

  it("reload profil : hydrate ne perd pas les URLs si le cache auth était vide", () => {
    const portraitUrl = PORTRAIT_PUBLIC;
    db.set(USER_ID, {
      id: USER_ID,
      portrait_url: portraitUrl,
      main_photo_url: portraitUrl,
      avatar_url: portraitUrl,
      fullbody_url: FULLBODY_PUBLIC,
    });

    const screenRow = simulateProfileScreenReload(db, USER_ID)!;
    const merged = mergeProfileScreenRowPreservingPhotos(
      { id: USER_ID, first_name: "Linda", profile_completed: true },
      screenRow,
    );

    expect(pickCanonicalPhotoStoredRef(merged)).toBe(portraitUrl);
    assertValidatedProfileHasCanonicalPhotoUrl({
      ...merged,
      photo1_status: "approved",
      photo2_status: "approved",
    });
  });

  it("sans signed URL ni sync : pipeline affichage échoue (régression Jacob)", async () => {
    getProfilePhotoSignedUrl.mockResolvedValue(null);
    buildSyncProfilePhotoDisplayCandidates.mockReturnValue([]);

    const row = mergeOnboardingPhotosIntoProfileRow(
      { id: USER_ID, photo1_status: "approved", photo2_status: "approved" },
      PORTRAIT_PUBLIC,
      FULLBODY_PUBLIC,
      supabase,
    );
    assertValidatedProfileHasCanonicalPhotoUrl(row);

    const displayUrls = await resolveProfilePhotoStoredRefDisplayUrls(
      pickCanonicalPhotoStoredRef(row)!,
    );
    expect(displayUrls).toEqual([]);

    expect(hasProfilePhotosModerationValidated(row)).toBe(true);
    expect(profileRowHasCanonicalPhotos(row)).toBe(true);
    expect(displayUrls.length).toBe(0);
  });
});
