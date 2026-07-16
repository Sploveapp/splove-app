import { describe, expect, it, vi, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  isHttpOrHttpsPhotoUrl,
  pickDirectHttpProfilePhotoUrl,
  resolveProfilePhotoUiSrc,
} from "./profilePhotoDisplayUrl";
import { resolveProfilePhotoDisplayUrl } from "./profilePhotoUpload";

const SUPABASE_URL = "https://abc.supabase.co";
const client = createClient(SUPABASE_URL, "test-anon-key");

const HTTPS_PORTRAIT =
  "https://abc.supabase.co/storage/v1/object/public/profile-photos/u1/portrait_1.jpg";

describe("PROFILE_PHOTO_FIX — HTTPS direct preview", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("isHttpOrHttpsPhotoUrl accepte les URL HTTPS valides", () => {
    expect(isHttpOrHttpsPhotoUrl(HTTPS_PORTRAIT)).toBe(true);
    expect(isHttpOrHttpsPhotoUrl("")).toBe(false);
    expect(isHttpOrHttpsPhotoUrl("profile-photos/u1/p.jpg")).toBe(false);
  });

  it("pickDirectHttpProfilePhotoUrl priorise portrait_url", () => {
    expect(
      pickDirectHttpProfilePhotoUrl({
        portrait_url: HTTPS_PORTRAIT,
        main_photo_url: "https://abc.supabase.co/storage/v1/object/public/profile-photos/u1/main.jpg",
        avatar_url: "https://abc.supabase.co/storage/v1/object/public/profile-photos/u1/avatar.jpg",
      }),
    ).toEqual({ url: HTTPS_PORTRAIT, field: "portrait_url" });
  });

  it("si facePhotoUrl est HTTPS, resolveProfilePhotoDisplayUrl ne produit pas no_candidates", async () => {
    const logs: unknown[][] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args);
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // createSignedUrl may fail in unit test — URL HTTPS must still be returned.
    const url = await resolveProfilePhotoDisplayUrl(client, HTTPS_PORTRAIT, {
      userId: "user-1",
      slot: "portrait",
    });

    expect(url).toBeTruthy();
    expect(isHttpOrHttpsPhotoUrl(url)).toBe(true);
    // facePreviewSrc equivalent: the returned URL is the HTTPS face photo (or signed).
    expect(url === HTTPS_PORTRAIT || (url?.includes("profile-photos") ?? false)).toBe(true);

    const failed = logs.some(
      (row) =>
        typeof row[0] === "string" &&
        row[0].includes("[SPLovePhoto]") &&
        String(row[0]).includes("ÉCHEC"),
    );
    expect(failed).toBe(false);

    const noCandidates = logs.some(
      (row) =>
        row.some(
          (arg) =>
            typeof arg === "object" &&
            arg !== null &&
            "error" in arg &&
            (arg as { error?: string }).error === "no_candidates",
        ),
    );
    expect(noCandidates).toBe(false);

    const directUsed = logs.some((row) => row[0] === "[PROFILE_PHOTO_FIX] direct_url_used");
    expect(directUsed).toBe(true);

    spy.mockRestore();
    warnSpy.mockRestore();
  });

  it("resolveProfilePhotoUiSrc conserve une URL HTTPS stockée si le hook échoue", () => {
    expect(resolveProfilePhotoUiSrc(HTTPS_PORTRAIT, null)).toBe(HTTPS_PORTRAIT);
  });
});
