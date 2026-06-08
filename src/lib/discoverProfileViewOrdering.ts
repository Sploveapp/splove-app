/**
 * Ordonnancement Move selon profile_views (jamais vus → vus sans action → dernier affiché).
 */

export type DiscoverProfileViewOrderingState = {
  viewedWithoutActionIds: Set<string>;
  lastViewedWithoutActionId: string | null;
  viewedAtByProfileId: Map<string, number>;
};

export function createEmptyProfileViewOrderingState(): DiscoverProfileViewOrderingState {
  return {
    viewedWithoutActionIds: new Set(),
    lastViewedWithoutActionId: null,
    viewedAtByProfileId: new Map(),
  };
}

export function orderDiscoverProfilesByProfileViews<T extends { id: string }>(
  profiles: T[],
  state: DiscoverProfileViewOrderingState | null | undefined,
): T[] {
  if (!state || profiles.length <= 1) return profiles;

  const { viewedWithoutActionIds, lastViewedWithoutActionId } = state;
  if (viewedWithoutActionIds.size === 0) return profiles;

  const neverSeen: T[] = [];
  const seenNoAction: T[] = [];
  const lastDisplayed: T[] = [];

  for (const p of profiles) {
    if (!viewedWithoutActionIds.has(p.id)) {
      neverSeen.push(p);
    } else if (p.id === lastViewedWithoutActionId) {
      lastDisplayed.push(p);
    } else {
      seenNoAction.push(p);
    }
  }

  if (seenNoAction.length === 0 && lastDisplayed.length === 0) return profiles;
  return [...neverSeen, ...seenNoAction, ...lastDisplayed];
}

export function applyLocalProfileViewWithoutAction(
  state: DiscoverProfileViewOrderingState,
  profileId: string,
): DiscoverProfileViewOrderingState {
  const viewedWithoutActionIds = new Set(state.viewedWithoutActionIds);
  viewedWithoutActionIds.add(profileId);
  const viewedAtByProfileId = new Map(state.viewedAtByProfileId);
  viewedAtByProfileId.set(profileId, Date.now());
  return {
    viewedWithoutActionIds,
    lastViewedWithoutActionId: profileId,
    viewedAtByProfileId,
  };
}

export function applyLocalProfileViewActionTaken(
  state: DiscoverProfileViewOrderingState,
  profileId: string,
): DiscoverProfileViewOrderingState {
  const viewedWithoutActionIds = new Set(state.viewedWithoutActionIds);
  viewedWithoutActionIds.delete(profileId);
  const viewedAtByProfileId = new Map(state.viewedAtByProfileId);
  viewedAtByProfileId.delete(profileId);

  let lastViewedWithoutActionId: string | null = null;
  let latestAt = -1;
  for (const id of viewedWithoutActionIds) {
    const at = viewedAtByProfileId.get(id) ?? 0;
    if (at >= latestAt) {
      latestAt = at;
      lastViewedWithoutActionId = id;
    }
  }

  return { viewedWithoutActionIds, lastViewedWithoutActionId, viewedAtByProfileId };
}

/** Déplace le profil courant en fin de pile (session en cours). */
export function rotateProfileToEndOfStack<T extends { id: string }>(
  profiles: T[],
  profileId: string,
): T[] | null {
  if (profiles.length <= 1) return null;
  const idx = profiles.findIndex((p) => p.id === profileId);
  if (idx < 0 || idx === profiles.length - 1) return null;
  const next = [...profiles];
  const [card] = next.splice(idx, 1);
  next.push(card);
  return next;
}
