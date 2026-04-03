/**
 * Types SPLove — base pour futures features
 */

/** Spot sportif (V2) */
export type Spot = {
  id: string | number;
  name: string;
  city: string;
  sport_id: number;
  sport_name?: string;
  ambiance?: string;
  moment_prefere?: string;
  created_at?: string;
  updated_at?: string;
};

/** Spot avec indicateurs pour l'UI (V2) */
export type SpotWithIndicators = Spot & {
  likes_count?: number;
  available_weekend_count?: number;
  compatible_profiles_count?: number;
};

/** Partenaire B2B (V2) — salles, clubs, terrains, etc. */
export type Partner = {
  id: string | number;
  spot_id: number;
  name: string;
  logo_url?: string;
  description?: string;
  website_url?: string;
  status?: "active" | "inactive";
};

/** Type de plan partenaire */
export type PartnerPlanType =
  | "sponsored"
  | "recommended"
  | "visibility"
  | "promotions";
