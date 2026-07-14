/** Seuils alignés sur `DiscoverSwipeCard` dans `Discover.tsx`. */
export const DISCOVER_SWIPE_COMMIT_PX = 72;
export const DISCOVER_TAP_MAX_PX = 15;

export type DiscoverSwipeGesture =
  | { kind: "tap" }
  | { kind: "pass" }
  | { kind: "like_classic" }
  | { kind: "reset" };

/** Résout le geste horizontal — swipe droit = Like classique, jamais Play. */
export function resolveDiscoverSwipeGesture(
  totalDx: number,
  totalDy: number,
): DiscoverSwipeGesture {
  const absX = Math.abs(totalDx);
  const absY = Math.abs(totalDy);

  if (
    absX < DISCOVER_SWIPE_COMMIT_PX &&
    absX <= DISCOVER_TAP_MAX_PX &&
    absY <= DISCOVER_TAP_MAX_PX
  ) {
    return { kind: "tap" };
  }
  if (totalDx <= -DISCOVER_SWIPE_COMMIT_PX) {
    return { kind: "pass" };
  }
  if (totalDx >= DISCOVER_SWIPE_COMMIT_PX) {
    return { kind: "like_classic" };
  }
  return { kind: "reset" };
}
