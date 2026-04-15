import type { SupabaseClient } from "@supabase/supabase-js";
import { isUndefinedColumnError } from "./profileSelect";

export type LocationSource = "manual" | "device";

export type ProfileLocationUpdate = {
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  discovery_radius_km: number;
  location_source: LocationSource;
};

/**
 * Met à jour la zone Discover dans `public.profiles` (une seule vérité produit).
 */
export async function updateProfileLocation(
  supabase: SupabaseClient,
  userId: string,
  patch: ProfileLocationUpdate,
): Promise<{ error: { message: string } | null }> {
  const base = {
    city: patch.city,
    latitude: patch.latitude,
    longitude: patch.longitude,
    discovery_radius_km: patch.discovery_radius_km,
    location_updated_at: new Date().toISOString(),
  };
  let { error } = await supabase
    .from("profiles")
    .update({
      ...base,
      location_source: patch.location_source,
    })
    .eq("id", userId);
  if (error && isUndefinedColumnError(error, "location_source")) {
    ({ error } = await supabase.from("profiles").update(base).eq("id", userId));
  }
  return { error };
}
