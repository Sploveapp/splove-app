import type { SupabaseClient } from "@supabase/supabase-js";
import { DISCOVER_BETA_SIMPLE_PIPELINE } from "./discoverBetaPipeline";
import {
  isRecoverableUnknownColumnError,
  markAdaptedOpennessFetchSkipped,
  shouldSkipAdaptedOpennessFetch,
} from "./profileSelect";

/**
 * Colonne d’ouverture pratique adaptée : `pref_open_to_adapted_activity` (bool, migration 041)
 * avant `open_to_adapted_activities` (text, migration 094) — souvent absente en prod.
 */
export async function mergeAdaptedOpennessFields(
  client: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  if (shouldSkipAdaptedOpennessFetch()) {
    return {};
  }

  const pref = await client
    .from("profiles")
    .select("pref_open_to_adapted_activity")
    .eq("id", userId)
    .maybeSingle();

  if (!pref.error && pref.data && typeof pref.data === "object") {
    return pref.data as Record<string, unknown>;
  }

  if (pref.error) {
    if (isRecoverableUnknownColumnError(pref.error)) {
      markAdaptedOpennessFetchSkipped();
    }
    return {};
  }

  const legacy = await client
    .from("profiles")
    .select("open_to_adapted_activities")
    .eq("id", userId)
    .maybeSingle();

  if (!legacy.error && legacy.data && typeof legacy.data === "object") {
    return legacy.data as Record<string, unknown>;
  }

  if (legacy.error && isRecoverableUnknownColumnError(legacy.error)) {
    markAdaptedOpennessFetchSkipped();
  }

  return {};
}

/** Fusion champs optionnels Discover viewer (hors boucle mergeOptional). */
export async function mergeDiscoverViewerOptionalFields(
  client: SupabaseClient,
  userId: string,
  mergeOptional: (c: SupabaseClient, id: string) => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  if (DISCOVER_BETA_SIMPLE_PIPELINE) return {};
  const [optional, adapted] = await Promise.all([
    mergeOptional(client, userId),
    mergeAdaptedOpennessFields(client, userId),
  ]);
  return { ...optional, ...adapted };
}
