/** Origine d’un droit explicite (hors abonnement SPLove+). */
export type FeatureEntitlementSource = "free" | "beta" | "subscription" | "purchase";

export type FeatureRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type UserEntitlementRow = {
  id: string;
  user_id: string;
  feature_key: string;
  source: FeatureEntitlementSource;
  expires_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export type FeaturePurchaseRow = {
  id: string;
  user_id: string;
  feature_key: string;
  price_paid: number;
  created_at: string;
};

/** Clés catalogue (alignées sur public.features) — extensible. */
export const FeatureKey = {
  secondChanceReturn: "second_chance_return",
  undoSwipeReturn: "undo_swipe_return",
} as const;

export type FeatureKeyId = (typeof FeatureKey)[keyof typeof FeatureKey];
