/**
 * Onglet actif de la bottom nav — dérivé uniquement de `location.pathname`.
 * Aucun state / localStorage / sessionStorage.
 */
export type BottomNavActiveTab = "move" | "likes" | "messages" | "profile" | null;

function normalizePathname(pathname: string): string {
  const raw = (pathname || "/").split("?")[0]!.split("#")[0] || "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw || "/";
}

/** True si le pathname active l’onglet Move (Discover). */
export function matchActiveMove(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return (
    path === "/" ||
    path === "/move" ||
    path.startsWith("/move/") ||
    path === "/discover" ||
    path.startsWith("/discover/")
  );
}

/** True si le pathname active l’onglet Likes. */
export function matchActiveLikes(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return path === "/likes-you" || path === "/likes" || path.startsWith("/likes-you/") || path.startsWith("/likes/");
}

/** True si le pathname active l’onglet Messages (liste ou conversation). */
export function matchActiveMessages(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return path === "/messages" || path.startsWith("/messages/") || path.startsWith("/chat/");
}

/** Routes où la barre native iOS flottante reste visible. */
export function isNativeBottomNavVisibleRoute(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (path === "/move" || path === "/likes-you" || path === "/messages" || path === "/profile") {
    return true;
  }
  if (path.startsWith("/chat/")) return true;
  return false;
}

/** True si le pathname active l’onglet Profil. */
export function matchActiveProfile(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return (
    path === "/profile" ||
    path === "/profil" ||
    path.startsWith("/profile/") ||
    path.startsWith("/profil/")
  );
}

/**
 * Calcule l’onglet actif depuis le pathname courant.
 * Priorité exclusive : un seul onglet (ou aucun hors routes principales).
 */
export function resolveBottomNavActiveTab(pathname: string): BottomNavActiveTab {
  if (matchActiveMove(pathname)) return "move";
  if (matchActiveLikes(pathname)) return "likes";
  if (matchActiveMessages(pathname)) return "messages";
  if (matchActiveProfile(pathname)) return "profile";
  return null;
}
