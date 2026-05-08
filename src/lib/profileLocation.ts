import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileLocationUpdate = {
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  discovery_radius_km: number;
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
  console.log("[PROFILE_QUERY_SAFE]", base);
  const { error } = await supabase.from("profiles").update(base).eq("id", userId);
  return { error };
}
