import { describe, expect, it } from "vitest";
import { DEFAULT_SPLOVE_PLAY, SPLOVE_PLAY_PREMIUM_TYPES } from "./splovePlay";

/** Même logique que Discover.handleLike → create_like_and_get_result. */
function buildLikeRpcArgs(profileId: string, playType: string) {
  return {
    p_liked_id: profileId,
    ...(playType !== DEFAULT_SPLOVE_PLAY ? { p_play_type: playType } : {}),
  };
}

describe("splovePlay RPC args", () => {
  const profileId = "11111111-1111-1111-1111-111111111111";

  it("classic like sends only p_liked_id", () => {
    expect(buildLikeRpcArgs(profileId, DEFAULT_SPLOVE_PLAY)).toEqual({
      p_liked_id: profileId,
    });
  });

  it.each(SPLOVE_PLAY_PREMIUM_TYPES.map((p) => [p, p] as const))(
    "premium play %s sends p_play_type",
    (playType) => {
      expect(buildLikeRpcArgs(profileId, playType)).toEqual({
        p_liked_id: profileId,
        p_play_type: playType,
      });
    },
  );
});
