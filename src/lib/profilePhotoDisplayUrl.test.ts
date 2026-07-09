import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  buildSyncProfilePhotoDisplayCandidates,
  directMainPhotoUrlFromProfile,
  isDirectPublicProfilePhotoUrl,
  skipSyncPublicProfilePhotoUrl,
} from "./profilePhotoDisplayUrl";

const SUPABASE_URL = "https://abc.supabase.co";
const ANON = "test-anon-key";
const client = createClient(SUPABASE_URL, ANON);

const PUBLIC_URL =
  "https://abc.supabase.co/storage/v1/object/public/profile-photos/user-1/portrait_1.jpg";
const SIGNED_URL =
  "https://abc.supabase.co/storage/v1/object/sign/profile-photos/user-1/portrait_1.jpg?token=expired";
const GOOGLE_AVATAR = "https://lh3.googleusercontent.com/a/avatar.jpg";

describe("skipSyncPublicProfilePhotoUrl", () => {
  it("ignore les URL publiques profile-photos (web + natif)", () => {
    expect(skipSyncPublicProfilePhotoUrl(PUBLIC_URL)).toBe(true);
    expect(skipSyncPublicProfilePhotoUrl(SIGNED_URL)).toBe(true);
  });

  it("n’ignore pas les avatars OAuth externes", () => {
    expect(skipSyncPublicProfilePhotoUrl(GOOGLE_AVATAR)).toBe(false);
  });
});

describe("buildSyncProfilePhotoDisplayCandidates", () => {
  it("ne retourne pas de signed URL ni d’URL publique profile-photos", () => {
    expect(buildSyncProfilePhotoDisplayCandidates(SIGNED_URL, client)).toEqual([]);
    expect(buildSyncProfilePhotoDisplayCandidates(PUBLIC_URL, client)).toEqual([]);
  });

  it("reconstruit depuis URL publique stockée (sans query)", () => {
    const withQuery = `${PUBLIC_URL}?t=1`;
    const urls = buildSyncProfilePhotoDisplayCandidates(withQuery, client);
    expect(urls).toEqual([]);
  });

  it("passe les avatars externes https", () => {
    const urls = buildSyncProfilePhotoDisplayCandidates(GOOGLE_AVATAR, client);
    expect(urls).toEqual([GOOGLE_AVATAR]);
  });

  it("résout un path nu profile-photos/…", () => {
    const urls = buildSyncProfilePhotoDisplayCandidates(
      "profile-photos/user-1/body.jpg",
      client,
    );
    expect(urls).toEqual([]);
  });
});

describe("directMainPhotoUrlFromProfile", () => {
  const PUBLIC_MAIN =
    "https://abc.supabase.co/storage/v1/object/public/profile-photos/u1/portrait.jpg";

  it("retourne main_photo_url publique telle quelle", () => {
    expect(
      directMainPhotoUrlFromProfile({ main_photo_url: PUBLIC_MAIN }),
    ).toBe(PUBLIC_MAIN);
  });

  it("rejette signed URL et avatar OAuth", () => {
    expect(
      isDirectPublicProfilePhotoUrl(
        "https://abc.supabase.co/storage/v1/object/sign/profile-photos/u1/p.jpg?token=x",
      ),
    ).toBe(false);
    expect(
      isDirectPublicProfilePhotoUrl("https://lh3.googleusercontent.com/a/avatar.jpg"),
    ).toBe(false);
    expect(directMainPhotoUrlFromProfile({ main_photo_url: null })).toBeNull();
  });
});
