import { describe, expect, it } from "vitest";
import {
  activityProposalNeedsUserAction,
  fetchActivityProposalsPendingActionCount,
} from "./activityProposalPendingAction";

describe("activityProposalNeedsUserAction", () => {
  const me = "user-me";
  const peer = "user-peer";
  const now = Date.parse("2026-07-30T12:00:00Z");

  it("requires action for pending proposal from peer", () => {
    expect(
      activityProposalNeedsUserAction(
        me,
        { proposer_id: peer, status: "pending", created_at: "2026-07-30T10:00:00Z" },
        now,
      ),
    ).toBe(true);
  });

  it("requires action for counter/reschedule from peer", () => {
    expect(
      activityProposalNeedsUserAction(
        me,
        { proposer_id: peer, status: "counter_proposed", created_at: "2026-07-30T10:00:00Z" },
        now,
      ),
    ).toBe(true);
  });

  it("ignores own proposals", () => {
    expect(
      activityProposalNeedsUserAction(
        me,
        { proposer_id: me, status: "pending", created_at: "2026-07-30T10:00:00Z" },
        now,
      ),
    ).toBe(false);
  });

  it("ignores expired pending proposals", () => {
    expect(
      activityProposalNeedsUserAction(
        me,
        {
          proposer_id: peer,
          status: "pending",
          created_at: "2026-07-20T10:00:00Z",
          expires_at: "2026-07-21T10:00:00Z",
        },
        now,
      ),
    ).toBe(false);
  });

  it("ignores accepted proposals", () => {
    expect(
      activityProposalNeedsUserAction(
        me,
        { proposer_id: peer, status: "accepted", created_at: "2026-07-30T10:00:00Z" },
        now,
      ),
    ).toBe(false);
  });
});

describe("fetchActivityProposalsPendingActionCount", () => {
  it("is exported for AppLayout and Profile", () => {
    expect(typeof fetchActivityProposalsPendingActionCount).toBe("function");
  });
});
