import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPLOVE_PLAY,
  resolveSplovePlayType,
  isSplovePlayType,
  isPremiumSplovePlay,
  formatReceivedPlayPresentation,
  formatPlaySentNotificationLine,
  SPLOVE_PLAY_META,
  SPLOVE_PLAY_PREMIUM_TYPES,
} from "./splovePlay";

const t = (key: string, vars?: Record<string, string | number>) => {
  const fr: Record<string, string> = {
    "splovePlay.warmup.title": "Échauffement",
    "splovePlay.warmup.receivedBody": "{{name}} aimerait apprendre à vous connaître.",
    "splovePlay.training.title": "Entraînement",
    "splovePlay.training.receivedBody": "{{name}} aimerait partager une activité avec vous.",
    "splovePlay.match.title": "Match",
    "splovePlay.match.receivedBody": "{{name}} aimerait voir où cette rencontre peut vous mener.",
    "splovePlay.victory.title": "Victoire",
    "splovePlay.victory.receivedBody": "{{name}} vous a envoyé un véritable coup de cœur.",
    "splovePlay.warmup.notifLabel": "Échauffement",
    "splovePlay.training.notifLabel": "Entraînement",
    "splovePlay.match.notifLabel": "Match",
    "splovePlay.victory.notifLabel": "Victoire",
    "splovePlay.notif.receivedLine":
      "{{name}} vous a envoyé un {{emoji}} {{playLabel}}.",
  };
  let out = fr[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
    }
  }
  return out;
};

describe("splovePlay", () => {
  it("resolveSplovePlayType defaults to classic", () => {
    expect(resolveSplovePlayType(null)).toBe(DEFAULT_SPLOVE_PLAY);
    expect(resolveSplovePlayType("invalid")).toBe(DEFAULT_SPLOVE_PLAY);
  });

  it("accepts all play values", () => {
    for (const play of ["classic", "warmup", "training", "match", "victory"] as const) {
      expect(isSplovePlayType(play)).toBe(true);
      expect(resolveSplovePlayType(play)).toBe(play);
    }
  });

  it("isPremiumSplovePlay excludes classic", () => {
    expect(isPremiumSplovePlay("classic")).toBe(false);
    expect(isPremiumSplovePlay("victory")).toBe(true);
  });

  it("warmup uses light-blue heart emoji", () => {
    expect(SPLOVE_PLAY_META.warmup.emoji).toBe("🩵");
  });

  it.each([
    ["warmup", "🩵", "Échauffement", "Linda aimerait apprendre à vous connaître."],
    ["training", "💚", "Entraînement", "Linda aimerait partager une activité avec vous."],
    ["match", "🧡", "Match", "Linda aimerait voir où cette rencontre peut vous mener."],
    ["victory", "💜", "Victoire", "Linda vous a envoyé un véritable coup de cœur."],
  ] as const)("formatReceivedPlayPresentation %s", (play, emoji, title, body) => {
    const p = formatReceivedPlayPresentation(t, play, "Linda");
    expect(p).not.toBeNull();
    expect(p!.emoji).toBe(emoji);
    expect(p!.title).toBe(title);
    expect(p!.heading).toBe(`${emoji} ${title}`);
    expect(p!.body).toBe(body);
  });

  it("formatReceivedPlayPresentation ignores classic", () => {
    expect(formatReceivedPlayPresentation(t, "classic", "Linda")).toBeNull();
  });

  it("covers all four premium intents", () => {
    expect(SPLOVE_PLAY_PREMIUM_TYPES).toEqual(["warmup", "training", "match", "victory"]);
  });

  it("formatPlaySentNotificationLine includes intention", () => {
    expect(formatPlaySentNotificationLine(t, "victory", "Linda")).toBe(
      "Linda vous a envoyé un 💜 Victoire.",
    );
  });
});
