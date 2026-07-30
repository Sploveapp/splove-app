/** Navigation HashRouter depuis les handlers push (hors arbre React). */

export type PushNavigateFn = (path: string, options?: { replace?: boolean }) => void;

let pushNavigateFn: PushNavigateFn | null = null;
let pendingPushRoute: string | null = null;

export function registerPushNavigate(fn: PushNavigateFn | null): void {
  pushNavigateFn = fn;
  if (fn && pendingPushRoute) {
    const route = pendingPushRoute;
    pendingPushRoute = null;
    fn(route, { replace: false });
  }
}

export function navigateFromPushRoute(route: string): void {
  const normalized = route.startsWith("/") ? route : `/${route}`;
  if (pushNavigateFn) {
    pushNavigateFn(normalized, { replace: false });
    return;
  }
  pendingPushRoute = normalized;
  if (typeof window === "undefined") return;
  const hashPath = normalized.startsWith("#") ? normalized : `#${normalized}`;
  if (window.location.hash !== hashPath) {
    window.location.hash = hashPath;
  }
}

/** Flush route en attente (cold start tap avant montage du bridge). */
export function flushPendingPushRoute(): void {
  if (!pendingPushRoute || !pushNavigateFn) return;
  const route = pendingPushRoute;
  pendingPushRoute = null;
  pushNavigateFn(route, { replace: false });
}

export function peekPendingPushRoute(): string | null {
  return pendingPushRoute;
}
