/** In-app Splove+ product identifiers (stores / mocks). */
export const SPLOVE_IAP_PRODUCT_IDS = {
  boost30m: "splove_boost_30m",
  ghost24h: "splove_ghost_24h",
  undo1: "splove_undo_1",
  secondChance1: "splove_second_chance_1",
  priorityMeet24h: "splove_priority_meet_24h",
  /** Pack Play — achat unique (architecture IAP, non branché). */
  playPack: "splove_play_pack",
} as const;

export type SploveIapProductId = (typeof SPLOVE_IAP_PRODUCT_IDS)[keyof typeof SPLOVE_IAP_PRODUCT_IDS];

/** Keys stored in user_credits / consumed on activation. */
export type SploveCreditType =
  | "boost_visibility"
  | "ghost_mode"
  | "undo_swipe"
  | "second_chance"
  | "priority_meet";

/** Timed rows persisted in feature_activations only. */
export type SploveTimedFeatureType =
  | "boost_visibility"
  | "ghost_mode"
  | "priority_meet";

export type SploveActivationSource = "credit" | "beta";

export type SploveTimedActivationRow = {
  id: string;
  user_id: string;
  feature_type: SploveTimedFeatureType;
  started_at: string;
  expires_at: string;
  metadata?: Record<string, unknown>;
};
