/**
 * SPLove Play — intention exprimée au like (complète le like classique).
 * Clés DB stables (`likes.play_type`).
 */
export type SplovePlayType = "classic" | "warmup" | "training" | "match" | "victory";

export const SPLOVE_PLAY_TYPES: readonly SplovePlayType[] = [
  "classic",
  "warmup",
  "training",
  "match",
  "victory",
] as const;

export const SPLOVE_PLAY_PREMIUM_TYPES: readonly SplovePlayType[] = [
  "warmup",
  "training",
  "match",
  "victory",
] as const;

export const DEFAULT_SPLOVE_PLAY: SplovePlayType = "classic";

export type SplovePlayMeta = {
  emoji: string;
  titleKey: string;
  lineKey: string;
  subtitleKey: string;
  receivedNotifKey: string;
  accentRgb: string;
};

export const SPLOVE_PLAY_META: Record<SplovePlayType, SplovePlayMeta> = {
  classic: {
    emoji: "❤️",
    titleKey: "splovePlay.classic.title",
    lineKey: "splovePlay.classic.line",
    subtitleKey: "splovePlay.classic.subtitle",
    receivedNotifKey: "likes.receivedPlay.classic",
    accentRgb: "255, 30, 45",
  },
  warmup: {
    emoji: "💙",
    titleKey: "splovePlay.warmup.title",
    lineKey: "splovePlay.warmup.line",
    subtitleKey: "splovePlay.warmup.subtitle",
    receivedNotifKey: "likes.receivedPlay.warmup",
    accentRgb: "59, 158, 255",
  },
  training: {
    emoji: "💚",
    titleKey: "splovePlay.training.title",
    lineKey: "splovePlay.training.line",
    subtitleKey: "splovePlay.training.subtitle",
    receivedNotifKey: "likes.receivedPlay.training",
    accentRgb: "76, 217, 100",
  },
  match: {
    emoji: "🧡",
    titleKey: "splovePlay.match.title",
    lineKey: "splovePlay.match.line",
    subtitleKey: "splovePlay.match.subtitle",
    receivedNotifKey: "likes.receivedPlay.match",
    accentRgb: "255, 149, 0",
  },
  victory: {
    emoji: "💜",
    titleKey: "splovePlay.victory.title",
    lineKey: "splovePlay.victory.line",
    subtitleKey: "splovePlay.victory.subtitle",
    receivedNotifKey: "likes.receivedPlay.victory",
    accentRgb: "175, 82, 222",
  },
};

export function isSplovePlayType(value: unknown): value is SplovePlayType {
  return typeof value === "string" && (SPLOVE_PLAY_TYPES as readonly string[]).includes(value);
}

export function resolveSplovePlayType(value: unknown): SplovePlayType {
  return isSplovePlayType(value) ? value : DEFAULT_SPLOVE_PLAY;
}

export function isPremiumSplovePlay(play: SplovePlayType): boolean {
  return play !== "classic";
}

export function formatReceivedPlayLine(
  t: (key: string, vars?: Record<string, string | number>) => string,
  play: unknown,
  name: string,
): string {
  const resolved = resolveSplovePlayType(play);
  return t(SPLOVE_PLAY_META[resolved].receivedNotifKey, { name });
}

/** Libellé court pour notifications in-app (`play_sent`). */
export function splovePlayNotificationLabel(
  t: (key: string) => string,
  play: unknown,
): string {
  const resolved = resolveSplovePlayType(play);
  return t(`splovePlay.${resolved}.notifLabel`);
}
