/**
 * Thème d’affichage des bulles **envoyées par l’utilisateur courant** dans le chat.
 * Les bulles reçues restent neutres (décidé dans le composant).
 *
 * Évolutions prévues (non implémentées) :
 * - Persistance serveur : `profiles.message_bubble_theme` (TEXT + CHECK)
 * - Thèmes contextuels (ex. lié au sport) : étendre l’union + `MESSAGE_BUBBLE_THEME_LABELS`
 */

/** Identifiants stables — à réutiliser pour le stockage distant. */
export type MessageBubbleTheme = "violet" | "blue" | "pink" | "graphite";

export const DEFAULT_MESSAGE_BUBBLE_THEME: MessageBubbleTheme = "violet";

export const MESSAGE_BUBBLE_THEME_IDS: readonly MessageBubbleTheme[] = [
  "violet",
  "blue",
  "pink",
  "graphite",
] as const;

export const MESSAGE_BUBBLE_THEME_LABELS: Record<MessageBubbleTheme, string> = {
  violet: "Rouge SPLove",
  blue: "Ardoise",
  pink: "Rose",
  graphite: "Graphite",
};

/** Snapshot JSON localStorage — migration future : même forme côté API. */
export type MessageBubbleThemeStorageV1 = {
  version: 1;
  theme: MessageBubbleTheme;
};

export const MESSAGE_BUBBLE_THEME_STORAGE_KEY = "splove.messageBubbleTheme.v1";

/** Émis sur `document` après sauvegarde (même onglet) pour mettre à jour le Chat sans recharger. */
export const MESSAGE_BUBBLE_THEME_CHANGED_EVENT = "splove:messageBubbleThemeChanged";

function isMessageBubbleTheme(value: unknown): value is MessageBubbleTheme {
  return typeof value === "string" && (MESSAGE_BUBBLE_THEME_IDS as readonly string[]).includes(value);
}

/** Parse une valeur issue du stockage ou d’une API ; tolérant, toujours un thème valide. */
export function coerceMessageBubbleTheme(value: unknown): MessageBubbleTheme {
  if (isMessageBubbleTheme(value)) return value;
  return DEFAULT_MESSAGE_BUBBLE_THEME;
}

/**
 * Classes Tailwind pour la bulle « moi » uniquement.
 * Couleurs douces, lisibles, alignées SPLove (pas de saturation agressive).
 */
export const OWN_MESSAGE_BUBBLE_CLASSES: Record<MessageBubbleTheme, string> = {
  violet:
    "border-[#FF1E2D]/22 bg-[#FF1E2D]/10 text-app-text shadow-sm",
  blue:
    "border-zinc-500/35 bg-zinc-800/60 text-app-text shadow-sm",
  pink:
    "border-rose-400/35 bg-rose-500/12 text-app-text shadow-sm",
  graphite:
    "border-app-border/85 bg-app-border/70 text-app-text shadow-sm",
};

export function getOwnMessageBubbleClassName(theme: MessageBubbleTheme | undefined | null): string {
  const t = coerceMessageBubbleTheme(theme);
  return `max-w-[85%] rounded-2xl border px-3.5 py-2.5 text-sm leading-snug ${OWN_MESSAGE_BUBBLE_CLASSES[t]}`;
}

export function loadMessageBubbleThemeFromStorage(): MessageBubbleTheme {
  try {
    const raw = localStorage.getItem(MESSAGE_BUBBLE_THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_MESSAGE_BUBBLE_THEME;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "theme" in parsed) {
      return coerceMessageBubbleTheme((parsed as MessageBubbleThemeStorageV1).theme);
    }
    return DEFAULT_MESSAGE_BUBBLE_THEME;
  } catch {
    return DEFAULT_MESSAGE_BUBBLE_THEME;
  }
}

export function saveMessageBubbleThemeToStorage(theme: MessageBubbleTheme): void {
  const payload: MessageBubbleThemeStorageV1 = { version: 1, theme };
  try {
    localStorage.setItem(MESSAGE_BUBBLE_THEME_STORAGE_KEY, JSON.stringify(payload));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(MESSAGE_BUBBLE_THEME_CHANGED_EVENT, { detail: { theme } }));
    }
  } catch {
    /* quota / mode privé : l’UI reste cohérente pour la session */
  }
}
