import { describe, expect, it } from "vitest";
import { presentNotification } from "./sploveNotifications";
import type { InAppNotificationRow } from "../services/inAppNotifications.service";

const t = (key: string) => {
  const fr: Record<string, string> = {
    "in_app_notif.someone": "Quelqu'un",
    "splovePlay.warmup.notifLabel": "Échauffement",
    "splovePlay.warmup.line": "J'aimerais apprendre à te connaître.",
    "splovePlay.training.notifLabel": "Entraînement",
    "splovePlay.training.line": "J'aimerais partager une activité avec toi.",
    "splovePlay.match.notifLabel": "Match",
    "splovePlay.match.line": "J'aimerais voir où cette rencontre peut nous mener.",
    "splovePlay.victory.notifLabel": "Victoire",
    "splovePlay.victory.line": "Tu es mon véritable coup de cœur.",
  };
  return fr[key] ?? key;
};

function playSentRow(playType: string, name = "Jacob"): InAppNotificationRow {
  return {
    id: "n1",
    user_id: "u2",
    kind: "play_sent",
    title: "",
    message: "",
    read: false,
    exempt_daily_cap: true,
    created_at: new Date().toISOString(),
    payload: { play_type: playType, actor_name: name, route: "/likes-you" },
  };
}

describe("play_sent notification presentation", () => {
  it.each([
    ["warmup", "💙", "Échauffement", "J'aimerais apprendre à te connaître."],
    ["training", "💚", "Entraînement", "J'aimerais partager une activité avec toi."],
    ["match", "🧡", "Match", "J'aimerais voir où cette rencontre peut nous mener."],
    ["victory", "💜", "Victoire", "Tu es mon véritable coup de cœur."],
  ] as const)("renders %s intention for recipient", (playType, emoji, label, quote) => {
    const row = presentNotification(playSentRow(playType), t);
    expect(row.emoji).toBe(emoji);
    expect(row.line).toBe(`Jacob — ${label}`);
    expect(row.subtitle).toBe(`« ${quote} »`);
    expect(row.route).toBe("/likes-you");
  });
});
