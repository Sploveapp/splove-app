import { describe, expect, it } from "vitest";
import {
  readPushPayload,
  resolvePushRoute,
  shouldSuppressForegroundPush,
} from "./pushNotificationRoutes";

describe("readPushPayload", () => {
  it("reads extended APNs custom fields", () => {
    const payload = readPushPayload({
      id: "1",
      data: {
        route: "/chat/abc",
        kind: "activity_proposed",
        conversationId: "abc",
        profileId: "user-1",
        proposalId: "prop-1",
      },
    });
    expect(payload.kind).toBe("activity_proposed");
    expect(payload.conversationId).toBe("abc");
    expect(payload.profileId).toBe("user-1");
    expect(payload.proposalId).toBe("prop-1");
  });

  it("maps play_sent kind and play type", () => {
    const payload = readPushPayload({
      id: "2",
      data: { kind: "play_sent", playType: "training", actorId: "liker-1" },
    });
    expect(payload.kind).toBe("play_sent");
    expect(payload.playType).toBe("training");
    expect(payload.profileId).toBe("liker-1");
  });
});

describe("resolvePushRoute", () => {
  it("falls back to likes-you for play_sent", () => {
    expect(
      resolvePushRoute({
        route: null,
        kind: "play_sent",
        conversationId: null,
        profileId: null,
        actorId: null,
        proposalId: null,
        playType: null,
      }),
    ).toBe("/likes-you");
  });

  it("opens chat for activity events", () => {
    expect(
      resolvePushRoute({
        route: null,
        kind: "activity_counter",
        conversationId: "conv-9",
        profileId: null,
        actorId: null,
        proposalId: null,
        playType: null,
      }),
    ).toBe("/chat/conv-9");
  });

  it("opens mes-rencontres for meetup_confirmed", () => {
    expect(
      resolvePushRoute({
        route: null,
        kind: "meetup_confirmed",
        conversationId: "conv-1",
        profileId: null,
        actorId: null,
        proposalId: null,
        playType: null,
      }),
    ).toBe("/mes-rencontres?tab=confirmed");
  });
});

describe("shouldSuppressForegroundPush", () => {
  it("suppresses play_sent on likes-you", () => {
    expect(
      shouldSuppressForegroundPush("/likes-you", {
        route: null,
        kind: "play_sent",
        conversationId: null,
      }),
    ).toBe(true);
  });

  it("suppresses activity on matching chat", () => {
    expect(
      shouldSuppressForegroundPush("/chat/xyz", {
        route: null,
        kind: "activity_proposed",
        conversationId: "xyz",
      }),
    ).toBe(true);
  });
});
