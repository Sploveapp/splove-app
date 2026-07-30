import { describe, expect, it } from "vitest";
import { presentNotification } from "./sploveNotifications";
import type { InAppNotificationRow } from "../services/inAppNotifications.service";

const t = (key: string, vars?: Record<string, string | number>) => {
  const fr: Record<string, string> = {
    "in_app_notif.someone": "Quelqu'un",
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

function playSentRow(playType: string, name = "Linda"): InAppNotificationRow {
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
    ["warmup", "🩵", "Échauffement"],
    ["training", "💚", "Entraînement"],
    ["match", "🧡", "Match"],
    ["victory", "💜", "Victoire"],
  ] as const)("renders %s intention for recipient", (playType, emoji, label) => {
    const row = presentNotification(playSentRow(playType), t);
    expect(row.emoji).toBe(emoji);
    expect(row.line).toBe(`Linda vous a envoyé un ${emoji} ${label}.`);
    expect(row.subtitle).toBeNull();
    expect(row.omitLineEmoji).toBe(true);
    expect(row.route).toBe("/likes-you");
  });
});
