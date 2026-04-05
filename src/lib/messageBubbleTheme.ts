/**
 * Thème d’affichage des bulles **envoyées par l’utilisateur courant** dans le chat.
 * Les bulles reçues restent neutres (décidé dans le composant).
 *
 * Couleurs : voir `chatColors.ts`.
 */

import {
  CHAT_BUBBLE_PALETTE_IDS,
  CHAT_OUTGOING_BUBBLE_SURFACE,
  DEFAULT_CHAT_BUBBLE_PALETTE_ID,
  type ChatBubblePaletteId,
} from "./chatColors";

/** Alias applicatif — identique à `ChatBubblePaletteId`. */
export type MessageBubbleTheme = ChatBubblePaletteId;

export const DEFAULT_MESSAGE_BUBBLE_THEME: MessageBubbleTheme = DEFAULT_CHAT_BUBBLE_PALETTE_ID;

export const MESSAGE_BUBBLE_THEME_IDS: readonly MessageBubbleTheme[] = CHAT_BUBBLE_PALETTE_IDS;

export const MESSAGE_BUBBLE_THEME_LABELS: Record<MessageBubbleTheme, string> = {
  red: "Rouge",
  violet: "Violet",
  green: "Vert",
  yellow: "Jaune",
  white: "Blanc",
};

/** Anciens identifiants stockés (localStorage) → nouvelle palette. */
const LEGACY_MESSAGE_BUBBLE_THEME_MAP: Partial<Record<string, MessageBubbleTheme>> = {
  violet: "red",
  blue: "violet",
  pink: "green",
  graphite: "white",
};

/** Snapshot JSON localStorage — migration future : même forme côté API. */
export type MessageBubbleThemeStorageV1 = {
  version: 1;
  theme: MessageBubbleTheme;
};

export const MESSAGE_BUBBLE_THEME_STORAGE_KEY = "splove.messageBubbleTheme.v1";

/** Émis sur `document` après sauvegarde (même onglet) pour mettre à jour le Chat sans recharger. */
export const MESSAGE_BUBBLE_THEME_CHANGED_EVENT = "splove:messageBubbleThemeChanged";

function isCurrentMessageBubbleTheme(value: string): value is MessageBubbleTheme {
  return (MESSAGE_BUBBLE_THEME_IDS as readonly string[]).includes(value);
}

/** Parse une valeur issue du stockage ou d’une API ; tolérant, toujours un thème valide. */
export function coerceMessageBubbleTheme(value: unknown): MessageBubbleTheme {
  if (typeof value !== "string") return DEFAULT_MESSAGE_BUBBLE_THEME;
  if (isCurrentMessageBubbleTheme(value)) return value;
  const mapped = LEGACY_MESSAGE_BUBBLE_THEME_MAP[value];
  if (mapped) return mapped;
  return DEFAULT_MESSAGE_BUBBLE_THEME;
}

export function getOwnMessageBubbleClassName(theme: MessageBubbleTheme | undefined | null): string {
  const t = coerceMessageBubbleTheme(theme);
  const surface = CHAT_OUTGOING_BUBBLE_SURFACE[t];
  return `max-w-[85%] rounded-2xl border px-3.5 py-2.5 text-sm leading-snug shadow-sm ${surface}`;
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
