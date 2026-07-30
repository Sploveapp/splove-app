import { usesNativeBottomNavigation } from "./nativeBottomNav";

type SploveNativeShellHandler = {
  postMessage: (body: unknown) => void;
};

function nativeShellHandler(): SploveNativeShellHandler | undefined {
  return (
    window as Window & {
      webkit?: { messageHandlers?: { sploveNativeShell?: SploveNativeShellHandler } };
    }
  ).webkit?.messageHandlers?.sploveNativeShell;
}

/**
 * Barre native iOS : visibilité + onglet actif dérivé du pathname React.
 * `activePath` permet de recalculer `selectedTab` après navigate("/move") post-auth.
 */
export function syncNativeBottomNavShell(opts: {
  visible: boolean;
  activePath: string;
}): void {
  if (!usesNativeBottomNavigation()) return;
  nativeShellHandler()?.postMessage({
    bottomNavVisible: opts.visible,
    activePath: opts.activePath,
  });
}

/** @deprecated Prefer syncNativeBottomNavShell — conserve compat appels existants. */
export function syncNativeBottomNavigationVisible(visible: boolean): void {
  if (!usesNativeBottomNavigation()) return;
  nativeShellHandler()?.postMessage({ bottomNavVisible: visible });
}

/** Badge icône iOS (UIApplication.applicationIconBadgeNumber). */
export function setNativeIconBadgeCount(count: number): void {
  if (!usesNativeBottomNavigation()) return;
  const safe = Number.isFinite(count) ? Math.max(0, Math.min(999, Math.floor(count))) : 0;
  nativeShellHandler()?.postMessage({ iconBadgeCount: safe });
}
