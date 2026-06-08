import { supabase } from "./supabase";
import { DISCOVER_BETA_SIMPLE_PIPELINE } from "./discoverBetaPipeline";

/** Erreur RPC / table / fonction absente — ne pas réessayer en boucle. */
export function isMissingSupabaseResourceError(
  error: { code?: string | number; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const c = String(error.code ?? "");
  const m = (error.message ?? "").toLowerCase();
  if (c === "42883" || c === "42P01" || c === "PGRST202" || c === "PGRST205" || c === "404") {
    return true;
  }
  return (
    m.includes("does not exist") ||
    m.includes("could not find the function") ||
    m.includes("could not find the table") ||
    m.includes("not found")
  );
}

export function warnOptional(label: string, error: { message?: string } | null | undefined): void {
  if (DISCOVER_BETA_SIMPLE_PIPELINE) return;
  const msg = (error?.message ?? "unknown").slice(0, 120);
  console.warn(`[optional] ${label} skipped`, msg);
}

export async function rpcOptional<T = unknown>(
  fn: string,
  params: Record<string, unknown>,
  label: string,
  timeoutMs = 2_500,
): Promise<T | null> {
  try {
    const call = supabase.rpc(fn, params);
    const raced = await Promise.race([
      call,
      new Promise<{ data: null; error: { message: string } }>((resolve) => {
        window.setTimeout(
          () => resolve({ data: null, error: { message: "timeout" } }),
          timeoutMs,
        );
      }),
    ]);
    const { data, error } = raced;
    if (error) {
      if (isMissingSupabaseResourceError(error) || error.message === "timeout") {
        warnOptional(label, error);
      } else {
        warnOptional(label, error);
      }
      return null;
    }
    return (data ?? null) as T | null;
  } catch (e) {
    warnOptional(label, e instanceof Error ? e : { message: String(e) });
    return null;
  }
}

/** Distances Discover — non bloquant (timeout court, carte vide si échec). */
export async function fetchProfileDistancesOptional(
  candidateIds: string[],
  label = "profile_distances_from_viewer",
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (candidateIds.length === 0) return out;
  if (DISCOVER_BETA_SIMPLE_PIPELINE) return out;

  const rows = await rpcOptional<
    { profile_id?: string; distance_km?: number | null }[] | null
  >(label, { p_candidate_ids: candidateIds }, label, 2_500);

  for (const row of rows ?? []) {
    const pid = typeof row?.profile_id === "string" ? row.profile_id : "";
    if (pid) out.set(pid, row.distance_km ?? null);
  }
  return out;
}
