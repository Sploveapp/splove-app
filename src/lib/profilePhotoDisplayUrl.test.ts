import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  buildSyncProfilePhotoDisplayCandidates,
  directMainPhotoUrlFromProfile,
  isDirectPublicProfilePhotoUrl,
} from "./profilePhotoDisplayUrl";

const SUPABASE_URL = "https://abc.supabase.co";
const ANON = "test-anon-key";
const client = createClient(SUPABASE_URL, ANON);

const PUBLIC_URL =
  "https://abc.supabase.co/storage/v1/object/public/profile-photos/user-1/portrait_1.jpg";
const SIGNED_URL =
  "https://abc.supabase.co/storage/v1/object/sign/profile-photos/user-1/portrait_1.jpg?token=expired";
const GOOGLE_AVATAR = "https://lh3.googleusercontent.com/a/avatar.jpg";

describe("buildSyncProfilePhotoDisplayCandidates", () => {
  it("re-canonicalise une signed URL expirée en URL publique uniquement", () => {
    const urls = buildSyncProfilePhotoDisplayCandidates(SIGNED_URL, client);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/profile-photos/user-1/portrait_1.jpg`,
    );
    expect(urls[0]).not.toContain("/object/sign/");
  });

  it("ne retourne jamais de signed URL", () => {
    const urls = buildSyncProfilePhotoDisplayCandidates(SIGNED_URL, client);
    for (const url of urls) {
      expect(url).not.toContain("/object/sign/");
    }
  });

  it("reconstruit depuis URL publique stockée (sans query)", () => {
    const withQuery = `${PUBLIC_URL}?t=1`;
    const urls = buildSyncProfilePhotoDisplayCandidates(withQuery, client);
    expect(urls[0]).toMatch(/\/object\/public\/profile-photos\//);
    expect(urls.every((u) => !u.includes("?"))).toBe(true);
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
    expect(urls[0]).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/profile-photos/user-1/body.jpg`,
    );
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
