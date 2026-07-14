import { describe, expect, it } from "vitest";
import {
  DISCOVER_SWIPE_COMMIT_PX,
  DISCOVER_TAP_MAX_PX,
  resolveDiscoverSwipeGesture,
} from "./discoverSwipeGesture";

describe("resolveDiscoverSwipeGesture", () => {
  it("drag gauche dépasse le seuil → Pass", () => {
    expect(resolveDiscoverSwipeGesture(-DISCOVER_SWIPE_COMMIT_PX, 0)).toEqual({
      kind: "pass",
    });
    expect(resolveDiscoverSwipeGesture(-120, 4)).toEqual({ kind: "pass" });
  });

  it("drag droite dépasse le seuil → Like classique (pas Play)", () => {
    expect(resolveDiscoverSwipeGesture(DISCOVER_SWIPE_COMMIT_PX, 0)).toEqual({
      kind: "like_classic",
    });
    expect(resolveDiscoverSwipeGesture(140, -3)).toEqual({ kind: "like_classic" });
  });

  it("petit mouvement → tap détail (distinction tap/drag)", () => {
    expect(resolveDiscoverSwipeGesture(0, 0)).toEqual({ kind: "tap" });
    expect(resolveDiscoverSwipeGesture(DISCOVER_TAP_MAX_PX, DISCOVER_TAP_MAX_PX)).toEqual({
      kind: "tap",
    });
  });

  it("mouvement insuffisant → reset sans action", () => {
    expect(resolveDiscoverSwipeGesture(40, 0)).toEqual({ kind: "reset" });
    expect(resolveDiscoverSwipeGesture(-40, 20)).toEqual({ kind: "reset" });
  });

  it("swipe actif sans abonnement Play — droite reste like_classic", () => {
    expect(resolveDiscoverSwipeGesture(90, 0).kind).toBe("like_classic");
  });
});
