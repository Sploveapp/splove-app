import { usesNativeBottomNavigation } from "./nativeBottomNav";

/** Message WKWebView → `SPLoveBridgeViewController` (handler `sploveNativeShell`). */
export function syncNativeBottomNavigationVisible(visible: boolean): void {
  if (!usesNativeBottomNavigation()) return;
  const handler = (
    window as Window & {
      webkit?: { messageHandlers?: { sploveNativeShell?: { postMessage: (body: unknown) => void } } };
    }
  ).webkit?.messageHandlers?.sploveNativeShell;
  handler?.postMessage({ bottomNavVisible: visible });
}
