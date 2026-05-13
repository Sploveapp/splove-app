/**
 * SPLove theme manager — système / clair / sombre.
 *
 * - Source unique de vérité : localStorage("splove-theme").
 * - Si absent → "system".
 * - "system" suit `prefers-color-scheme` du téléphone et se met à jour
 *   automatiquement quand celui-ci bascule.
 * - Applique `theme-light` ou `theme-dark` sur <html> uniquement (pas d'autre
 *   effet de bord) : aucune couleur du DOM existant n'est altérée tant que
 *   les feuilles de style n'ajoutent pas de règles ciblées sur ces classes.
 * - Diffuse `splove-theme-changed` (CustomEvent) à chaque application, pour
 *   permettre à de futurs composants (réglages, etc.) de réagir.
 */

export type ThemeMode = "system" | "light" | "dark";
export type EffectiveTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "splove-theme";
export const THEME_CHANGED_EVENT = "splove-theme-changed";
const DEFAULT_MODE: ThemeMode = "system";

export interface ThemeChangedDetail {
  mode: ThemeMode;
  effective: EffectiveTheme;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(raw) ? raw : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

function writeStoredMode(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* quota / private mode — silencieux */
  }
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveEffectiveTheme(mode: ThemeMode): EffectiveTheme {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

function applyEffectiveTheme(effective: EffectiveTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("theme-dark", effective === "dark");
  root.classList.toggle("theme-light", effective === "light");
  root.dataset.theme = effective;
}

function dispatchChange(mode: ThemeMode, effective: EffectiveTheme): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<ThemeChangedDetail>(THEME_CHANGED_EVENT, {
        detail: { mode, effective },
      }),
    );
  } catch {
    /* environnements sans CustomEvent — ignore */
  }
}

export function getThemeMode(): ThemeMode {
  return readStoredMode();
}

export function getEffectiveTheme(): EffectiveTheme {
  return resolveEffectiveTheme(readStoredMode());
}

/**
 * Bascule le mode de thème et persiste le choix.
 * Mettre `"system"` pour revenir au suivi automatique du téléphone.
 */
export function setThemeMode(mode: ThemeMode): void {
  if (!isThemeMode(mode)) return;
  writeStoredMode(mode);
  const effective = resolveEffectiveTheme(mode);
  applyEffectiveTheme(effective);
  dispatchChange(mode, effective);
}

let systemMql: MediaQueryList | null = null;
let systemListener: ((event: MediaQueryListEvent) => void) | null = null;
let initialized = false;

/**
 * Idempotent : applique le thème stocké (ou "system") sur <html> et arme
 * l'écoute de `prefers-color-scheme` quand le mode actuel est "system".
 * À appeler une fois au bootstrap, avant le render.
 */
export function initTheme(): void {
  if (typeof window === "undefined") return;

  const mode = readStoredMode();
  applyEffectiveTheme(resolveEffectiveTheme(mode));

  if (initialized) return;
  initialized = true;

  if (typeof window.matchMedia !== "function") return;

  systemMql = window.matchMedia("(prefers-color-scheme: dark)");
  systemListener = () => {
    if (readStoredMode() !== "system") return;
    const effective = resolveEffectiveTheme("system");
    applyEffectiveTheme(effective);
    dispatchChange("system", effective);
  };

  if (typeof systemMql.addEventListener === "function") {
    systemMql.addEventListener("change", systemListener);
  } else if (typeof (systemMql as MediaQueryList & { addListener?: (cb: (e: MediaQueryListEvent) => void) => void }).addListener === "function") {
    (systemMql as MediaQueryList & { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(systemListener);
  }
}
