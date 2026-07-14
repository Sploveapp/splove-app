import { describe, expect, it } from "vitest";
import { sanitizeForLog, sanitizeForLogString } from "./sanitizeForLog";

describe("sanitizeForLog", () => {
  it("redacte access_token et refresh_token dans un objet session", () => {
    const out = sanitizeForLog({
      access_token: "secret-access",
      refresh_token: "secret-refresh",
      token_type: "bearer",
      user: { id: "12345678-abcd-efgh-ijkl-123456789012" },
    }) as Record<string, unknown>;
    expect(out.hasAccessToken).toBe(true);
    expect(out.hasRefreshToken).toBe(true);
    expect(out.access_token).toBeUndefined();
    expect(out.refresh_token).toBeUndefined();
  });

  it("redacte Preferences.get value JSON session", () => {
    const sessionJson = JSON.stringify({
      access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig",
      refresh_token: "rt-secret",
      expires_at: 123,
    });
    const out = sanitizeForLog({ value: sessionJson }) as Record<string, unknown>;
    expect(out.valueKind).toBe("json_session");
    const value = out.value as Record<string, unknown>;
    expect(value.hasAccessToken).toBe(true);
    expect(value.hasRefreshToken).toBe(true);
    expect(JSON.stringify(value)).not.toContain("rt-secret");
  });

  it("redacte JWT et Bearer dans une chaîne", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const out = sanitizeForLogString(`Authorization: Bearer ${jwt}`);
    expect(out).not.toContain(jwt);
    expect(out).toContain("[redacted-jwt]");
  });

  it("conserve URL Supabase sans tokens", () => {
    const out = sanitizeForLogString("https://example.supabase.co/storage/v1/object/sign/profile-photos/u/p.jpg");
    expect(out).toContain("supabase.co");
    expect(out).not.toContain("[redacted-jwt]");
  });
});
