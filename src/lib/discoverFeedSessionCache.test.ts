import { describe, expect, it } from "vitest";
import {
  buildDiscoverFeedSessionSnapshot,
  clearDiscoverFeedSessionCache,
  deserializeProfileViewOrdering,
  readDiscoverFeedSessionCache,
  writeDiscoverFeedSessionCache,
} from "./discoverFeedSessionCache";
import { createEmptyProfileViewOrderingState } from "./discoverProfileViewOrdering";

describe("discoverFeedSessionCache", () => {
  it("restitue le snapshot pour le même user et fingerprint", () => {
    clearDiscoverFeedSessionCache();
    const snap = buildDiscoverFeedSessionSnapshot({
      userId: "u1",
      ageFingerprint: "18:35",
      profiles: [{ id: "p1" }],
      stableProfiles: [{ id: "p1" }],
      feedReady: true,
      errorMessage: "",
      viewerGeoBlocked: false,
      passedProfileIds: [],
      profileViewOrdering: createEmptyProfileViewOrderingState(),
      swipeHistory: [],
      undoStack: [],
      mySportMatchKeys: [],
    });
    writeDiscoverFeedSessionCache(snap);
    expect(readDiscoverFeedSessionCache("u1", "18:35")).toEqual(snap);
    expect(readDiscoverFeedSessionCache("u1", "25:40")).toBeNull();
    expect(readDiscoverFeedSessionCache("u2", "18:35")).toBeNull();
  });

  it("round-trip profile view ordering", () => {
    const state = {
      viewedWithoutActionIds: new Set(["a", "b"]),
      lastViewedWithoutActionId: "b",
      viewedAtByProfileId: new Map([
        ["a", 1],
        ["b", 2],
      ]),
    };
    const snap = buildDiscoverFeedSessionSnapshot({
      userId: "u1",
      ageFingerprint: "ø:ø",
      profiles: [{ id: "p1" }],
      stableProfiles: [{ id: "p1" }],
      feedReady: true,
      errorMessage: "",
      viewerGeoBlocked: false,
      passedProfileIds: ["x"],
      profileViewOrdering: state,
      swipeHistory: [],
      undoStack: [],
      mySportMatchKeys: ["run"],
    });
    const restored = deserializeProfileViewOrdering(snap.profileViewOrdering);
    expect([...restored.viewedWithoutActionIds]).toEqual(["a", "b"]);
    expect(restored.lastViewedWithoutActionId).toBe("b");
    expect(restored.viewedAtByProfileId.get("b")).toBe(2);
  });
});
