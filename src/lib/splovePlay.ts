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
  /** Corps reçu (3e personne), avec `{{name}}`. */
  receivedBodyKey: string;
  receivedNotifKey: string;
  accentRgb: string;
};

export const SPLOVE_PLAY_META: Record<SplovePlayType, SplovePlayMeta> = {
  classic: {
    emoji: "❤️",
    titleKey: "splovePlay.classic.title",
    lineKey: "splovePlay.classic.line",
    subtitleKey: "splovePlay.classic.subtitle",
    receivedBodyKey: "splovePlay.classic.receivedBody",
    receivedNotifKey: "likes.receivedPlay.classic",
    accentRgb: "255, 30, 45",
  },
  warmup: {
    emoji: "🩵",
    titleKey: "splovePlay.warmup.title",
    lineKey: "splovePlay.warmup.line",
    subtitleKey: "splovePlay.warmup.subtitle",
    receivedBodyKey: "splovePlay.warmup.receivedBody",
    receivedNotifKey: "likes.receivedPlay.warmup",
    accentRgb: "59, 158, 255",
  },
  training: {
    emoji: "💚",
    titleKey: "splovePlay.training.title",
    lineKey: "splovePlay.training.line",
    subtitleKey: "splovePlay.training.subtitle",
    receivedBodyKey: "splovePlay.training.receivedBody",
    receivedNotifKey: "likes.receivedPlay.training",
    accentRgb: "76, 217, 100",
  },
  match: {
    emoji: "🧡",
    titleKey: "splovePlay.match.title",
    lineKey: "splovePlay.match.line",
    subtitleKey: "splovePlay.match.subtitle",
    receivedBodyKey: "splovePlay.match.receivedBody",
    receivedNotifKey: "likes.receivedPlay.match",
    accentRgb: "255, 149, 0",
  },
  victory: {
    emoji: "💜",
    titleKey: "splovePlay.victory.title",
    lineKey: "splovePlay.victory.line",
    subtitleKey: "splovePlay.victory.subtitle",
    receivedBodyKey: "splovePlay.victory.receivedBody",
    receivedNotifKey: "likes.receivedPlay.victory",
    accentRgb: "175, 82, 222",
  },
};

export type SplovePlayIntentPresentation = {
  play: SplovePlayType;
  emoji: string;
  /** Ex. « 💚 Entraînement » */
  heading: string;
  title: string;
  body: string;
  accentRgb: string;
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

/**
 * Présentation UX d’un Play reçu : toujours emoji + nom + description.
 * Retourne `null` pour classic / inconnu (pas d’intention Play à expliquer).
 */
export function formatReceivedPlayPresentation(
  t: (key: string, vars?: Record<string, string | number>) => string,
  play: unknown,
  name: string,
): SplovePlayIntentPresentation | null {
  const resolved = resolveSplovePlayType(play);
  if (!isPremiumSplovePlay(resolved)) return null;
  const meta = SPLOVE_PLAY_META[resolved];
  const title = t(meta.titleKey);
  const emoji = meta.emoji;
  return {
    play: resolved,
    emoji,
    heading: `${emoji} ${title}`,
    title,
    body: t(meta.receivedBodyKey, { name }),
    accentRgb: meta.accentRgb,
  };
}

/** Ligne notification : « Linda vous a envoyé un 💜 Victoire. » */
export function formatPlaySentNotificationLine(
  t: (key: string, vars?: Record<string, string | number>) => string,
  play: unknown,
  name: string,
): string {
  const resolved = resolveSplovePlayType(play);
  const meta = SPLOVE_PLAY_META[resolved];
  const playLabel = splovePlayNotificationLabel(t, resolved);
  return t("splovePlay.notif.receivedLine", {
    name,
    emoji: meta.emoji,
    playLabel,
  });
}
