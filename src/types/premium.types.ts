/**
 * Types SPLove+ (premium)
 */

export type SubscriptionPlan = "plus";
export type SubscriptionStatus = "active" | "canceled" | "expired" | "past_due";

export type Subscription = {
  id: string;
  profile_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  started_at: string;
  /** Absent si la colonne n’existe pas en base (repli premium.service). */
  ends_at?: string | null;
  created_at: string;
  updated_at: string;
  external_id?: string | null;
  provider?: string | null;
};

export type ProfileBoost = {
  id: number;
  profile_id: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
};

export type VerificationStatus = "pending" | "verified" | "rejected";

export type ProfileVerification = {
  id: number;
  profile_id: string;
  status: VerificationStatus;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ActivitySlot = {
  id: number;
  profile_id: string;
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  label: string | null;
  created_at: string;
};

export type PremiumFeatureKey =
  | "likes_you"
  | "advanced_filters"
  | "sport_passport"
  | "activity_agenda"
  | "radar_available_now"
  | "verified_badge";

export type LikeReceived = {
  id: string;
  liker_id: string;
  liked_id: string;
  created_at: string;
  is_match?: boolean;
  match_id?: string | null;
  conversation_id?: string | null;
  profile?: ProfileInLikesYou;
};

export type ProfileInLikesYou = {
  id: string;
  first_name: string | null;
  city: string | null;
  main_photo_url: string | null;
  portrait_url?: string | null;
  fullbody_url?: string | null;
  /** Aligné Discover / `isPreferenceCompatible`. */
  gender?: string | null;
  looking_for?: string | null;
  sport_feeling: string | null;
  sport_phrase: string | null;
  sport_time: string | null;
  is_photo_verified?: boolean | null;
  /** Badge « vérifié » (MVP) : `photo_status === 'approved'`. */
  photo_status?: string | null;
  profile_sports?: { sports: { label: string; slug?: string } | null }[];
};
