/**
 * Onboarding step — energy / vibe A/B labels and keys stored in `profiles.sport_intensity`.
 */

export type OnboardingVariant = "A" | "B";

export const ENERGY_OPTION_KEYS_A = ["dynamic", "chill", "both"] as const;

export const ENERGY_OPTION_KEYS_B = ["active", "relaxed", "flexible"] as const;

export type EnergyOptionKey =
  | (typeof ENERGY_OPTION_KEYS_A)[number]
  | (typeof ENERGY_OPTION_KEYS_B)[number];

export type EnergyOption = {
  key: EnergyOptionKey;
  label: {
    fr: string;
    en: string;
  };
};

export const energyOptionsA: EnergyOption[] = [
  {
    key: "dynamic",
    label: { fr: "Dynamique", en: "Dynamic" },
  },
  {
    key: "chill",
    label: { fr: "Tranquille", en: "Chill" },
  },
  {
    key: "both",
    label: { fr: "Les deux", en: "Both" },
  },
];

export const energyOptionsB: EnergyOption[] = [
  {
    key: "active",
    label: { fr: "Active", en: "Active" },
  },
  {
    key: "relaxed",
    label: { fr: "Détendue", en: "Relaxed" },
  },
  {
    key: "flexible",
    label: { fr: "Flexible", en: "Flexible" },
  },
];

/** Values permitted in DB after migration 087 (includes legacy chill | intense). */
export const ALLOWED_STORED_ENERGY_KEYS = [
  "chill",
  "intense",
  "dynamic",
  "both",
  "active",
  "relaxed",
  "flexible",
] as const;

export type AllowedStoredSportIntensity = (typeof ALLOWED_STORED_ENERGY_KEYS)[number];

export function isAllowedStoredSportIntensity(raw: unknown): raw is AllowedStoredSportIntensity {
  return (
    typeof raw === "string" &&
    (ALLOWED_STORED_ENERGY_KEYS as readonly string[]).includes(raw)
  );
}

export function onboardingVariantFromProfile(raw: unknown): OnboardingVariant {
  const s = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return s === "B" ? "B" : "A";
}

export function energyOptionsForVariant(variant: OnboardingVariant): EnergyOption[] {
  return variant === "B" ? energyOptionsB : energyOptionsA;
}

/**
 * Hydrate onboarding selection from `sport_intensity` + cohort.
 * Legacy `intense` maps to variant A « dynamic », variant B « active ».
 */
export function normalizeIntensityForOnboardingHydrate(
  raw: string | null | undefined,
  cohort: OnboardingVariant,
): "" | EnergyOptionKey {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";

  const keysA = ENERGY_OPTION_KEYS_A as readonly string[];
  const keysB = ENERGY_OPTION_KEYS_B as readonly string[];

  if (cohort === "A") {
    if (keysA.includes(s)) return s as EnergyOptionKey;
    if (s === "intense") return "dynamic";
    if (s === "chill") return "chill";
    return "";
  }

  if (keysB.includes(s)) return s as EnergyOptionKey;
  if (s === "intense") return "active";
  if (s === "chill") return "relaxed";
  return "";
}

export function isEnergySelectionComplete(
  cohort: OnboardingVariant,
  selectedKey: string,
): boolean {
  const keys = cohort === "B" ? ENERGY_OPTION_KEYS_B : ENERGY_OPTION_KEYS_A;
  return (keys as readonly string[]).includes(selectedKey);
}
