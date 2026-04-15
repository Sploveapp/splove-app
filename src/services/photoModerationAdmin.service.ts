/**
 * File modération photos (staff). À brancher sur une UI admin : l’utilisateur doit figurer
 * dans `public.moderation_staff` pour que les policies RLS autorisent lecture / RPC.
 *
 * Requête SQL équivalente pending_review :
 * `select * from public.photo_moderation_results where status = 'pending_review' order by created_at;`
 * (service_role / staff uniquement — pas de lecture grand public.)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PhotoModerationResultRow = {
  id: string;
  user_id: string;
  photo_slot: number;
  storage_path: string;
  status: string;
  provider: string | null;
  provider_labels: unknown;
  risk_score: number | null;
  decision_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export async function fetchPendingReviewPhotoResults(
  client: SupabaseClient,
): Promise<{ data: PhotoModerationResultRow[] | null; error: Error | null }> {
  const { data, error } = await client
    .from("photo_moderation_results")
    .select(
      "id, user_id, photo_slot, storage_path, status, provider, provider_labels, risk_score, decision_reason, reviewed_by, reviewed_at, created_at",
    )
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: (data ?? []) as PhotoModerationResultRow[], error: null };
}

export async function moderationResolvePhotoResult(
  client: SupabaseClient,
  resultId: string,
  decision: "approved" | "rejected",
): Promise<{ error: Error | null }> {
  const { error } = await client.rpc("moderation_resolve_photo_result", {
    p_result_id: resultId,
    p_decision: decision,
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
