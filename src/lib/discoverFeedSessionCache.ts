import type { DiscoverProfileViewOrderingState } from "./discoverProfileViewOrdering";

/** Snapshot JSON-serialisable du feed Move (conservé entre navigations d’onglets). */
export type DiscoverFeedSessionSnapshot = {
  userId: string;
  ageFingerprint: string;
  profiles: unknown[];
  stableProfiles: unknown[];
  feedReady: boolean;
  errorMessage: string;
  viewerGeoBlocked: boolean;
  passedProfileIds: string[];
  profileViewOrdering: SerializedProfileViewOrdering;
  swipeHistory: unknown[];
  undoStack: unknown[];
  mySportMatchKeys: string[];
};

type SerializedProfileViewOrdering = {
  viewedWithoutActionIds: string[];
  lastViewedWithoutActionId: string | null;
  viewedAtByProfileId: Record<string, number>;
};

let sessionSnapshot: DiscoverFeedSessionSnapshot | null = null;

function serializeProfileViewOrdering(
  state: DiscoverProfileViewOrderingState,
): SerializedProfileViewOrdering {
  return {
    viewedWithoutActionIds: [...state.viewedWithoutActionIds],
    lastViewedWithoutActionId: state.lastViewedWithoutActionId,
    viewedAtByProfileId: Object.fromEntries(state.viewedAtByProfileId),
  };
}

export function deserializeProfileViewOrdering(
  raw: SerializedProfileViewOrdering,
): DiscoverProfileViewOrderingState {
  return {
    viewedWithoutActionIds: new Set(raw.viewedWithoutActionIds),
    lastViewedWithoutActionId: raw.lastViewedWithoutActionId,
    viewedAtByProfileId: new Map(
      Object.entries(raw.viewedAtByProfileId).map(([k, v]) => [k, Number(v)]),
    ),
  };
}

export function readDiscoverFeedSessionCache(
  userId: string,
  ageFingerprint: string,
): DiscoverFeedSessionSnapshot | null {
  if (!userId || !sessionSnapshot) return null;
  if (sessionSnapshot.userId !== userId) return null;
  if (sessionSnapshot.ageFingerprint !== ageFingerprint) return null;
  if (!sessionSnapshot.feedReady || sessionSnapshot.stableProfiles.length === 0) return null;
  return sessionSnapshot;
}

export function writeDiscoverFeedSessionCache(snapshot: DiscoverFeedSessionSnapshot): void {
  sessionSnapshot = snapshot;
  if (import.meta.env.DEV) {
    console.log("MOVE_FEED_CACHE_WRITE", {
      userId: snapshot.userId.slice(0, 8),
      count: snapshot.stableProfiles.length,
      topId: (snapshot.stableProfiles[0] as { id?: string } | undefined)?.id ?? null,
    });
  }
}

export function clearDiscoverFeedSessionCache(): void {
  sessionSnapshot = null;
}

export function buildDiscoverFeedSessionSnapshot(input: {
  userId: string;
  ageFingerprint: string;
  profiles: unknown[];
  stableProfiles: unknown[];
  feedReady: boolean;
  errorMessage: string;
  viewerGeoBlocked: boolean;
  passedProfileIds: Iterable<string>;
  profileViewOrdering: DiscoverProfileViewOrderingState;
  swipeHistory: unknown[];
  undoStack: unknown[];
  mySportMatchKeys: Iterable<string>;
}): DiscoverFeedSessionSnapshot {
  return {
    userId: input.userId,
    ageFingerprint: input.ageFingerprint,
    profiles: input.profiles,
    stableProfiles: input.stableProfiles,
    feedReady: input.feedReady,
    errorMessage: input.errorMessage,
    viewerGeoBlocked: input.viewerGeoBlocked,
    passedProfileIds: [...input.passedProfileIds],
    profileViewOrdering: serializeProfileViewOrdering(input.profileViewOrdering),
    swipeHistory: input.swipeHistory,
    undoStack: input.undoStack,
    mySportMatchKeys: [...input.mySportMatchKeys],
  };
}
