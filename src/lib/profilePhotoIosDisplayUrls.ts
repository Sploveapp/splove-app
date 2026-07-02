import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { buildSyncProfilePhotoDisplayCandidates } from "./profilePhotoDisplayUrl";
import { normalizeProfilePhotoStoredRef } from "./profilePhotoUpload";

/** URLs à tenter via CapacitorHttp (signed, public, etc.) — couche affichage iOS uniquement. */
export function buildIosCapacitorImageFetchUrlCandidates(
  storedRef: string | null | undefined,
  resolvedUrl: string | null | undefined,
  client: SupabaseClient = supabase,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    const t = typeof value === "string" ? value.trim() : "";
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  push(resolvedUrl);
  const normalized = normalizeProfilePhotoStoredRef(storedRef, client).trim();
  push(normalized);
  for (const candidate of buildSyncProfilePhotoDisplayCandidates(storedRef, client)) {
    push(candidate);
  }

  return out;
}
