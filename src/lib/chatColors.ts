/**
 * Palette des bulles **sortantes** (chat) — jetons Tailwind centralisés.
 * Les bulles entrantes restent neutres dans `Chat.tsx` (non gérées ici).
 */

export type ChatBubblePaletteId = "red" | "violet" | "green" | "yellow" | "white";

export const CHAT_BUBBLE_PALETTE_IDS: readonly ChatBubblePaletteId[] = [
  "red",
  "violet",
  "green",
  "yellow",
  "white",
] as const;

export const DEFAULT_CHAT_BUBBLE_PALETTE_ID: ChatBubblePaletteId = "red";

/** Classes surface (bordure + fond + texte) — contraste garanti par choix fixe clair/foncé. */
export const CHAT_OUTGOING_BUBBLE_SURFACE: Record<ChatBubblePaletteId, string> = {
  red: "border-[#FF1E2D]/45 bg-[#FF1E2D] text-white",
  violet: "border-violet-600/40 bg-violet-600 text-white",
  green: "border-emerald-600/40 bg-emerald-600 text-white",
  yellow: "border-amber-400/55 bg-amber-300 text-neutral-900",
  white: "border-zinc-400/70 bg-white text-neutral-900",
};
