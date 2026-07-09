import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { isProfilePhotosPublicStorageUrl } from "./profilePhotoSignedUrl";

/** URLs à tenter via CapacitorHttp — signed uniquement pour profile-photos (jamais public). */
export function buildIosCapacitorImageFetchUrlCandidates(
  storedRef: string | null | undefined,
  resolvedUrl: string | null | undefined,
  _client: SupabaseClient = supabase,
): string[] {
  void storedRef;
  void _client;
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    const t = typeof value === "string" ? value.trim() : "";
    if (!t || seen.has(t) || isProfilePhotosPublicStorageUrl(t)) return;
    seen.add(t);
    out.push(t);
  };

  push(resolvedUrl);

  return out;
}
