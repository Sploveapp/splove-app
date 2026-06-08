/** Navigation HashRouter depuis les handlers push (hors arbre React). */

export type PushNavigateFn = (path: string, options?: { replace?: boolean }) => void;

let pushNavigateFn: PushNavigateFn | null = null;

export function registerPushNavigate(fn: PushNavigateFn | null): void {
  pushNavigateFn = fn;
}

export function navigateFromPushRoute(route: string): void {
  const normalized = route.startsWith("/") ? route : `/${route}`;
  if (pushNavigateFn) {
    pushNavigateFn(normalized, { replace: false });
    return;
  }
  if (typeof window === "undefined") return;
  const hashPath = normalized.startsWith("#") ? normalized : `#${normalized}`;
  if (window.location.hash !== hashPath) {
    window.location.hash = hashPath;
  }
}
