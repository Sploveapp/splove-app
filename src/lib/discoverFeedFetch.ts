import { supabase } from "./supabase";
import type { Profile } from "../contexts/AuthContext";

export type DiscoverFeedRow = {
  profile: Profile | null;
  activity_label: string | null;
  availability_label: string | null;
  vibe_label: string | null;
  feed_reason: string | null;
};

type RpcFeedRow = {
  profile?: Profile | null;
  activity_label?: string | null;
  availability_label?: string | null;
  vibe_label?: string | null;
  feed_reason?: string | null;
};

const FEED_PROFILE_SELECT =
  "id, first_name, birth_date, created_at, updated_at, last_active_at, gender, looking_for, intent, sport_feeling, sport_phrase, height_cm, portrait_url, fullbody_url, avatar_url, main_photo_url, city, latitude, longitude, profile_completed, onboarding_completed, onboarding_done, is_photo_verified, photo_status, is_active_mode, sport_practice_type, sport_match_preference, preferred_age_min, preferred_age_max, discovery_radius_km";

/**
 * Charge le feed Discover : RPC `get_discover_feed_alive`, repli sur `feed_profiles`.
 */
export async function fetchDiscoverFeedAlive(
  limit: number,
  viewerId: string,
): Promise<{ rows: DiscoverFeedRow[]; source: "rpc" | "feed_profiles_fallback"; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc("get_discover_feed_alive", { p_limit: limit });
    if (!error) {
      const rows = ((data ?? []) as RpcFeedRow[]).map((row) => ({
        profile: (row.profile ?? null) as Profile | null,
        activity_label: row.activity_label ?? null,
        availability_label: row.availability_label ?? null,
        vibe_label: row.vibe_label ?? null,
        feed_reason: row.feed_reason ?? null,
      }));
      return { rows, source: "rpc", error: null };
    }

    console.warn("[Discover feed] get_discover_feed_alive failed — fallback feed_profiles", {
      code: error.code,
      message: error.message,
    });

    const { data: feedRows, error: feedErr } = await supabase
      .from("feed_profiles")
      .select(FEED_PROFILE_SELECT)
      .neq("id", viewerId)
      .eq("profile_completed", true)
      .limit(Math.min(Math.max(limit, 1), 50));

    if (feedErr) {
      return { rows: [], source: "feed_profiles_fallback", error: feedErr.message };
    }

    const rows: DiscoverFeedRow[] = (feedRows ?? []).map((p) => ({
      profile: p as unknown as Profile,
      activity_label: null,
      availability_label: null,
      vibe_label: null,
      feed_reason: "feed_profiles_fallback",
    }));
    return { rows, source: "feed_profiles_fallback", error: null };
  } catch (e) {
    console.warn("[Discover feed] fetch failed", e);
    throw e;
  }
}
