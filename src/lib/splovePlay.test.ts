import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPLOVE_PLAY,
  resolveSplovePlayType,
  isSplovePlayType,
  isPremiumSplovePlay,
} from "./splovePlay";

describe("splovePlay", () => {
  it("resolveSplovePlayType defaults to classic", () => {
    expect(resolveSplovePlayType(null)).toBe(DEFAULT_SPLOVE_PLAY);
    expect(resolveSplovePlayType("invalid")).toBe(DEFAULT_SPLOVE_PLAY);
  });

  it("accepts all play values", () => {
    for (const play of ["classic", "warmup", "training", "match", "victory"] as const) {
      expect(isSplovePlayType(play)).toBe(true);
      expect(resolveSplovePlayType(play)).toBe(play);
    }
  });

  it("isPremiumSplovePlay excludes classic", () => {
    expect(isPremiumSplovePlay("classic")).toBe(false);
    expect(isPremiumSplovePlay("victory")).toBe(true);
  });
});
