import { supabase } from "../lib/supabase";
import type { FeatureRow, UserEntitlementRow, FeaturePurchaseRow } from "../types/features.types";

/**
 * true si l’utilisateur courant a la feature (SPLove+ actif, ou entitlement valide, selon public.user_has_feature).
 */
export async function userHasFeature(featureKey: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("user_has_feature", { p_feature_key: featureKey });
  if (error) {
    if (error.code === "42883" || error.message?.includes("user_has_feature")) {
      return false;
    }
    console.warn("[features] user_has_feature", error.message);
    return false;
  }
  return data === true;
}

/** Catalogue (features actives + inactives pour paywall / admin). */
export async function fetchFeaturesCatalog(): Promise<FeatureRow[]> {
  const { data, error } = await supabase
    .from("features")
    .select("id, key, label, description, category, is_active, created_at, updated_at")
    .order("category", { ascending: true })
    .order("label", { ascending: true });
  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return [];
    }
    console.warn("[features] fetchFeaturesCatalog", error.message);
    return [];
  }
  return (data ?? []) as FeatureRow[];
}

export async function fetchMyEntitlements(): Promise<UserEntitlementRow[]> {
  const { data, error } = await supabase
    .from("user_entitlements")
    .select("id, user_id, feature_key, source, expires_at, metadata, created_at, updated_at");
  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return [];
    }
    console.warn("[features] fetchMyEntitlements", error.message);
    return [];
  }
  return (data ?? []) as UserEntitlementRow[];
}

export async function fetchMyFeaturePurchases(): Promise<FeaturePurchaseRow[]> {
  const { data, error } = await supabase
    .from("feature_purchases")
    .select("id, user_id, feature_key, price_paid, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return [];
    }
    console.warn("[features] fetchMyFeaturePurchases", error.message);
    return [];
  }
  return (data ?? []) as FeaturePurchaseRow[];
}
