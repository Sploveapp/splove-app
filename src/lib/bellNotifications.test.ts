import { describe, expect, it } from "vitest";
import { BELL_NOTIFICATION_KINDS } from "../services/inAppNotifications.service";
import {
  isBellCenterNotificationRow,
  presentNotification,
  sortNotifications,
} from "./sploveNotifications";
import type { InAppNotificationRow } from "../services/inAppNotifications.service";

const t = (key: string, vars?: Record<string, string | number>) => {
  const fr: Record<string, string> = {
    "in_app_notif.someone": "Quelqu'un",
    "in_app_notif.social.new_like": "{{name}} vous a envoyé un Like.",
    "in_app_notif.social.new_match": "{{name}} vous a envoyé un 🧡 Match.",
    "in_app_notif.social.new_message": "{{name}} vous a envoyé un message.",
    "in_app_notif.social.activity_proposed": "{{name}} vous propose une activité.",
    "in_app_notif.social.activity_accepted": "{{name}} a accepté votre activité.",
    "activity_default_sport": "Sport",
    "place_to_define": "Lieu",
    "splovePlay.training.notifLabel": "Entraînement",
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

function row(
  partial: Partial<InAppNotificationRow> & Pick<InAppNotificationRow, "kind" | "id">,
): InAppNotificationRow {
  return {
    user_id: "u1",
    title: "",
    message: "",
    read: false,
    created_at: new Date().toISOString(),
    payload: {},
    ...partial,
  };
}

describe("bell notification kinds", () => {
  it("includes Play and first message", () => {
    expect(BELL_NOTIFICATION_KINDS).toContain("play_sent");
    expect(BELL_NOTIFICATION_KINDS).toContain("new_message");
    expect(BELL_NOTIFICATION_KINDS).toContain("new_like");
    expect(BELL_NOTIFICATION_KINDS).toContain("new_match");
    expect(BELL_NOTIFICATION_KINDS).toContain("activity_proposed");
    expect(BELL_NOTIFICATION_KINDS).toContain("activity_accepted");
  });

  it("filters center rows by bell kinds", () => {
    expect(isBellCenterNotificationRow({ kind: "new_message" })).toBe(true);
    expect(isBellCenterNotificationRow({ kind: "play_sent" })).toBe(true);
    expect(isBellCenterNotificationRow({ kind: "invite_followup_day1" })).toBe(false);
  });
});

describe("notification copy", () => {
  it("renders expected product lines", () => {
    expect(
      presentNotification(
        row({
          id: "1",
          kind: "new_like",
          payload: { actor_name: "Linda" },
        }),
        t,
      ).line,
    ).toBe("Linda vous a envoyé un Like.");

    expect(
      presentNotification(
        row({
          id: "2",
          kind: "play_sent",
          payload: { actor_name: "Linda", play_type: "training" },
        }),
        t,
      ).line,
    ).toBe("Linda vous a envoyé un 💚 Entraînement.");

    expect(
      presentNotification(
        row({
          id: "3",
          kind: "new_match",
          payload: { actor_name: "Linda" },
        }),
        t,
      ).line,
    ).toBe("Linda vous a envoyé un 🧡 Match.");

    expect(
      presentNotification(
        row({
          id: "4",
          kind: "new_message",
          payload: { actor_name: "Linda", conversation_id: "c1" },
        }),
        t,
      ).line,
    ).toBe("Linda vous a envoyé un message.");

    expect(
      presentNotification(
        row({
          id: "5",
          kind: "activity_proposed",
          payload: { actor_name: "Linda", sport: "Trail" },
        }),
        t,
      ).line,
    ).toBe("Linda vous propose une activité.");

    expect(
      presentNotification(
        row({
          id: "6",
          kind: "activity_accepted",
          payload: { actor_name: "Linda" },
        }),
        t,
      ).line,
    ).toBe("Linda a accepté votre activité.");
  });

  it("resolves deep links with liker profile", () => {
    const like = presentNotification(
      row({
        id: "7",
        kind: "new_like",
        payload: { actor_id: "liker-1", actor_name: "Jenny" },
      }),
      t,
    );
    expect(like.route).toBe("/likes-you?liker=liker-1");
  });
});

describe("sortNotifications", () => {
  it("orders newest first regardless of read state", () => {
    const sorted = sortNotifications([
      row({ id: "old", kind: "new_like", read: false, created_at: "2026-01-01T00:00:00Z" }),
      row({ id: "new", kind: "new_match", read: true, created_at: "2026-06-01T00:00:00Z" }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["new", "old"]);
  });
});
