/**
 * Registre unique des couleurs de bulles sortantes (chat).
 * Clés stables stockées (localStorage `chat-accent:*`, etc.) — n’inventer que des clés listées ici.
 */

export type ChatBubbleColorKey = "red" | "violet" | "green" | "yellow" | "white";

export type ChatBubbleColorDef = {
  /** Libellé affiché (sélecteur Profil / menu Chat). */
  label: string;
  /** Classes Tailwind : bordure + fond + couleur de texte pour la bulle message sortante. */
  bubbleSurfaceClass: string;
  /** Pastille / aperçu compact (picker). */
  previewClass: string;
  /** Anneau de focus sur la zone de saisie. */
  inputFocusClass: string;
  /** Bouton envoyer (styles inline). */
  sendButton: { bg: string; text: string };
  /** Pastille du menu « Style de discussion ». */
  dotClass: string;
};

export const CHAT_BUBBLE_COLORS: Record<ChatBubbleColorKey, ChatBubbleColorDef> = {
  red: {
    label: "colors.red",
    bubbleSurfaceClass: "border-[#FF1E2D]/45 bg-[#FF1E2D] text-white",
    previewClass: "bg-[#FF1E2D]",
    inputFocusClass: "focus:border-[#FF1E2D]/60 focus:ring-[#FF1E2D]/35",
    sendButton: { bg: "#FF1E2D", text: "#FFFFFF" },
    dotClass: "bg-[#FF1E2D]",
  },
  violet: {
    label: "colors.purple",
    bubbleSurfaceClass: "border-violet-600/40 bg-violet-600 text-white",
    previewClass: "bg-violet-600",
    inputFocusClass: "focus:border-violet-400/70 focus:ring-violet-400/35",
    sendButton: { bg: "#7C3AED", text: "#FFFFFF" },
    dotClass: "bg-violet-500",
  },
  green: {
    label: "colors.green",
    bubbleSurfaceClass: "border-emerald-600/40 bg-emerald-600 text-white",
    previewClass: "bg-emerald-600",
    inputFocusClass: "focus:border-emerald-400/70 focus:ring-emerald-400/35",
    sendButton: { bg: "#059669", text: "#FFFFFF" },
    dotClass: "bg-emerald-500",
  },
  yellow: {
    label: "colors.yellow",
    bubbleSurfaceClass: "border-amber-400/55 bg-amber-300 text-neutral-900",
    previewClass: "bg-amber-300",
    inputFocusClass: "focus:border-amber-300/70 focus:ring-amber-300/35",
    sendButton: { bg: "#F59E0B", text: "#111827" },
    dotClass: "bg-amber-400",
  },
  white: {
    label: "colors.white",
    bubbleSurfaceClass: "border-zinc-400/70 bg-white text-neutral-900",
    previewClass: "bg-white",
    inputFocusClass: "focus:border-zinc-200/70 focus:ring-zinc-200/30",
    sendButton: { bg: "#F8FAFC", text: "#111827" },
    dotClass: "bg-white ring-1 ring-app-border",
  },
};

/** Ordre d’affichage des options (Profil, Chat, etc.). */
export const CHAT_BUBBLE_COLOR_ORDER: readonly ChatBubbleColorKey[] = [
  "red",
  "violet",
  "green",
  "yellow",
  "white",
] as const;

export const DEFAULT_CHAT_BUBBLE_COLOR_KEY: ChatBubbleColorKey = "red";

/** Compat : même contenu que les `bubbleSurfaceClass` du registre. */
export const CHAT_OUTGOING_BUBBLE_SURFACE: Record<ChatBubbleColorKey, string> = {
  red: CHAT_BUBBLE_COLORS.red.bubbleSurfaceClass,
  violet: CHAT_BUBBLE_COLORS.violet.bubbleSurfaceClass,
  green: CHAT_BUBBLE_COLORS.green.bubbleSurfaceClass,
  yellow: CHAT_BUBBLE_COLORS.yellow.bubbleSurfaceClass,
  white: CHAT_BUBBLE_COLORS.white.bubbleSurfaceClass,
};

export function isChatBubbleColorKey(value: string): value is ChatBubbleColorKey {
  return (CHAT_BUBBLE_COLOR_ORDER as readonly string[]).includes(value);
}

/** Libellé pour une clé connue ; fallback sûr pour clé inconnue. */
export function getChatBubbleColorLabel(key: string): string {
  if (isChatBubbleColorKey(key)) return CHAT_BUBBLE_COLORS[key].label;
  return CHAT_BUBBLE_COLORS[DEFAULT_CHAT_BUBBLE_COLOR_KEY].label;
}

/** Entrée registre ou défaut si clé absente / inconnue. */
export function getChatBubbleColorDef(key: string): ChatBubbleColorDef {
  if (isChatBubbleColorKey(key)) return CHAT_BUBBLE_COLORS[key];
  return CHAT_BUBBLE_COLORS[DEFAULT_CHAT_BUBBLE_COLOR_KEY];
}
