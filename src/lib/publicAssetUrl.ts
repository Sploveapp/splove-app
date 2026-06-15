/**
 * URL d’un fichier `public/` — toujours depuis la racine du site.
 * Évite les 404 sur routes SPA (/auth, /discover) quand Vite `base` est `./`.
 */
export function publicAssetUrl(path: string): string {
  const normalized = path.replace(/^\//, "");
  return `/${normalized}`;
}
