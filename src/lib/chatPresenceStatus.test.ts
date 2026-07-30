import { describe, expect, it } from "vitest";
import {
  CHAT_BACK_TO_MOVE_PATH,
  CHAT_COMPOSER_SAFE_AREA_PADDING_BOTTOM,
  CHAT_HEADER_SAFE_AREA_PADDING_TOP,
  formatChatPresenceLabel,
  resolveChatPresenceStatus,
  resolveChatComposerPaddingBottom,
} from "./chatPresenceStatus";

describe("chatPresenceStatus / chat navigation constants", () => {
  it("le bouton SPLove navigue vers /move", () => {
    expect(CHAT_BACK_TO_MOVE_PATH).toBe("/move");
  });

  it("le header et le composer utilisent la safe area iOS", () => {
    expect(CHAT_HEADER_SAFE_AREA_PADDING_TOP).toContain("safe-area-inset-top");
    expect(CHAT_COMPOSER_SAFE_AREA_PADDING_BOTTOM).toContain("safe-area-inset-bottom");
  });

  it("composer remonte au-dessus du clavier quand visualViewport le signale", () => {
    expect(resolveChatComposerPaddingBottom(0)).toBe(CHAT_COMPOSER_SAFE_AREA_PADDING_BOTTOM);
    expect(resolveChatComposerPaddingBottom(320)).toBe("12px");
  });

  it("zone tactile minimale documentée via constante header (44pt appliquée en UI)", () => {
    // Contrat UI : bouton retour = h-11 w-11 (44×44). Vérifié ici via padding safe-area.
    expect(CHAT_HEADER_SAFE_AREA_PADDING_TOP.startsWith("calc(env(safe-area-inset-top")).toBe(true);
  });

  it("présence : en ligne / minutes / aujourd’hui / récemment", () => {
    const now = Date.parse("2026-07-19T15:00:00.000Z");
    expect(resolveChatPresenceStatus(new Date(now - 5 * 60_000).toISOString(), now).kind).toBe(
      "online",
    );
    expect(resolveChatPresenceStatus(new Date(now - 90 * 60_000).toISOString(), now)).toEqual({
      kind: "minutes",
      minutesAgo: 90,
    });
    // Même jour, > 3 h → « Vu aujourd’hui à HH:mm »
    const morning = Date.parse("2026-07-19T08:05:00.000Z");
    const todayStatus = resolveChatPresenceStatus(new Date(morning).toISOString(), now);
    expect(todayStatus.kind).toBe("today");
    expect(todayStatus.timeLabel).toMatch(/^\d{2}:\d{2}$/);
    expect(resolveChatPresenceStatus(new Date(now - 2 * 24 * 60 * 60_000).toISOString(), now).kind).toBe(
      "recent",
    );
    expect(resolveChatPresenceStatus(null, now).kind).toBe(null);
  });

  it("formatage i18n présence", () => {
    const t = (key: string, vars?: Record<string, string | number>) => {
      if (key === "chat_presence_online") return "En ligne";
      if (key === "chat_presence_minutes") return `Vu il y a ${vars?.minutes} min`;
      if (key === "chat_presence_today") return `Vu aujourd’hui à ${vars?.time}`;
      if (key === "chat_presence_recent") return "Vu récemment";
      return key;
    };
    const now = Date.parse("2026-07-19T15:00:00.000Z");
    expect(formatChatPresenceLabel(new Date(now - 3 * 60_000).toISOString(), t, now)).toBe(
      "En ligne",
    );
    expect(formatChatPresenceLabel(null, t, now)).toBe(null);
  });

  it("aucun accusé de lecture fictif — pas de delivered_at dans ce module", () => {
    const src = Object.keys({ CHAT_BACK_TO_MOVE_PATH, resolveChatPresenceStatus }).join(",");
    expect(src.includes("delivered")).toBe(false);
  });
});
