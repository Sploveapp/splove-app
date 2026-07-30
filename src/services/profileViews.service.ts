import { supabase } from "../lib/supabase";
import type { DiscoverProfileViewOrderingState } from "../lib/discoverProfileViewOrdering";

export async function fetchDiscoverProfileViewOrderingState(
  viewerId: string,
): Promise<DiscoverProfileViewOrderingState> {
  const empty: DiscoverProfileViewOrderingState = {
    viewedWithoutActionIds: new Set(),
    lastViewedWithoutActionId: null,
    viewedAtByProfileId: new Map(),
  };
  if (!viewerId) return empty;

  const { data, error } = await supabase
    .from("profile_views")
    .select("viewed_profile_id, viewed_at, action_taken")
    .eq("viewer_id", viewerId)
    .order("viewed_at", { ascending: false })
    .limit(200);

  if (error) {
    console.warn("[profile_views] fetch ordering state failed", error.message);
    return empty;
  }

  const viewedWithoutActionIds = new Set<string>();
  const viewedAtByProfileId = new Map<string, number>();
  let lastViewedWithoutActionId: string | null = null;

  for (const row of data ?? []) {
    const profileId = row.viewed_profile_id as string | undefined;
    if (!profileId) continue;
    if (row.action_taken === true) continue;

    viewedWithoutActionIds.add(profileId);
    const at = row.viewed_at ? Date.parse(String(row.viewed_at)) : Date.now();
    viewedAtByProfileId.set(profileId, Number.isFinite(at) ? at : Date.now());
    if (!lastViewedWithoutActionId) {
      lastViewedWithoutActionId = profileId;
    }
  }

  return { viewedWithoutActionIds, lastViewedWithoutActionId, viewedAtByProfileId };
}

/** Enregistre ou met à jour une vue sans like/pass. */
export async function recordProfileViewWithoutAction(
  viewerId: string,
  viewedProfileId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!viewerId || !viewedProfileId || viewerId === viewedProfileId) {
    return { ok: false, error: "invalid_ids" };
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("profile_views").upsert(
    {
      viewer_id: viewerId,
      viewed_profile_id: viewedProfileId,
      viewed_at: now,
      action_taken: false,
    },
    { onConflict: "viewer_id,viewed_profile_id" },
  );

  if (error) {
    console.warn("[profile_views] record view failed", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Marque qu’une action explicite (like/pass) a été prise sur ce profil. */
export async function markProfileViewActionTaken(
  viewerId: string,
  viewedProfileId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!viewerId || !viewedProfileId) {
    return { ok: false, error: "invalid_ids" };
  }

  const { error } = await supabase
    .from("profile_views")
    .update({ action_taken: true })
    .eq("viewer_id", viewerId)
    .eq("viewed_profile_id", viewedProfileId);

  if (error) {
    console.warn("[profile_views] mark action_taken failed", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
