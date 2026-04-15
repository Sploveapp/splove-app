import { BETA_MODE } from "../constants/beta";
import { supabase } from "../lib/supabase";
import type { Subscription } from "../types/premium.types";

const ACTIVE_STATUS = "active";

/**
 * Vérifie si le profil a un abonnement SPLove+ actif.
 */
export async function getActiveSubscription(
  profileId: string
): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("profile_id", profileId)
    .eq("status", ACTIVE_STATUS)
    .or("ends_at.is.null,ends_at.gt." + new Date().toISOString())
    .order("ends_at", { ascending: false, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getActiveSubscription", error);
    return null;
  }
  return data as Subscription | null;
}

/**
 * Indique si l'utilisateur a accès à SPLove+ (abonnement actif).
 */
export async function hasPremiumAccess(profileId: string): Promise<boolean> {
  if (BETA_MODE) return true;
  const sub = await getActiveSubscription(profileId);
  return sub != null;
}
