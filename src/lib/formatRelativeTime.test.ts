import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./formatRelativeTime";
import { parseSupabaseTimestamp } from "./parseSupabaseTimestamp";

describe("parseSupabaseTimestamp", () => {
  it("parses ISO with Z", () => {
    expect(parseSupabaseTimestamp("2025-06-01T12:00:00Z")).toBe(Date.parse("2025-06-01T12:00:00Z"));
  });

  it("treats space-separated UTC as Z", () => {
    const ms = parseSupabaseTimestamp("2025-06-01 12:00:00");
    expect(ms).toBe(Date.parse("2025-06-01T12:00:00Z"));
  });

  it("returns NaN for empty", () => {
    expect(Number.isNaN(parseSupabaseTimestamp(""))).toBe(true);
    expect(Number.isNaN(parseSupabaseTimestamp(null))).toBe(true);
  });
});

describe("formatRelativeTime", () => {
  const locale = "fr-FR";
  const now = Date.parse("2026-07-30T12:00:00Z");

  it("shows past relative time for old notifications", () => {
    const out = formatRelativeTime("2025-01-01T00:00:00Z", locale, now, { assumePast: true });
    expect(out).not.toMatch(/^dans /i);
    expect(out.length).toBeGreaterThan(0);
  });

  it("never shows future seconds for received notifications (clock skew)", () => {
    const slightlyFuture = new Date(now + 4_000).toISOString();
    const out = formatRelativeTime(slightlyFuture, locale, now, { assumePast: true });
    expect(out).not.toMatch(/^dans /i);
  });

  it("shows absolute date for very old events", () => {
    const out = formatRelativeTime("2024-03-12T10:00:00Z", locale, now, {
      assumePast: true,
      absoluteAfterDays: 30,
    });
    expect(out).toMatch(/2024/);
  });
});
