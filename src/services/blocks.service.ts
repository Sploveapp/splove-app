import { supabase } from "../lib/supabase";

function rpcUuidArrayToSet(data: unknown): Set<string> {
  if (data == null) return new Set();
  const arr = Array.isArray(data) ? data : [];
  return new Set(
    arr.map((id) => String(id)).filter((id) => id.length > 0),
  );
}

export async function insertBlock(blockerId: string, blockedId: string): Promise<{ error: Error | null }> {
  if (!blockerId || !blockedId || blockerId === blockedId) {
    return { error: new Error("Blocage invalide.") };
  }
  const { error } = await supabase.from("blocks").insert({
    blocker_id: blockerId,
    blocked_id: blockedId,
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export type BlockExclusionDetail = {
  excluded: Set<string>;
  /** Rempli si lecture directe des lignes ; sinon vide (exclusions via RPC). */
  rowsWhereIAmBlocker: { blocked: string }[];
  rowsWhereIAmBlocked: { blocker: string }[];
  errors: string[];
};

/**
 * Tous les profils à exclure (j’ai bloqué ou j’ai été bloqué) — aligné sur
 * `public.list_user_ids_blocked_with_me()` (SECURITY DEFINER, même logique que le feed SQL).
 */
export async function fetchBlockExclusionDetail(_currentUserId?: string | null): Promise<BlockExclusionDetail> {
  const empty: BlockExclusionDetail = {
    excluded: new Set(),
    rowsWhereIAmBlocker: [],
    rowsWhereIAmBlocked: [],
    errors: [],
  };

  const { data, error } = await supabase.rpc("list_user_ids_blocked_with_me");
  if (error) {
    console.error("[blocks] list_user_ids_blocked_with_me", error);
    empty.errors.push(error.message);
    return empty;
  }
  empty.excluded = rpcUuidArrayToSet(data);
  return empty;
}

/** Ids impliqués dans un blocage avec l’utilisateur courant (les deux sens). */
export async function fetchBlockedRelatedUserIds(currentUserId?: string | null): Promise<Set<string>> {
  const d = await fetchBlockExclusionDetail(currentUserId);
  return d.excluded;
}

export async function isBlockedWith(otherUserId: string): Promise<boolean> {
  if (!otherUserId) return false;
  const { data, error } = await supabase.rpc("is_blocked_with", {
    p_other_user_id: otherUserId,
  });
  if (error) {
    console.error("[blocks] is_blocked_with", error);
    return false;
  }
  return data === true;
}
