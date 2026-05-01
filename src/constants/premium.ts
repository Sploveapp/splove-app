/**
 * Constantes SPLove+
 */

export const PREMIUM_PLAN_ID = "plus";

export const BOOST_DURATION_MINUTES = 30;

/** Date de fin de bêta (UTC). */
export const BETA_END_DATE = "2026-06-30T23:59:59.000Z";

export const PREMIUM_FEATURE_KEYS = [
  "likes_you",
  "advanced_filters",
  "sport_passport",
  "activity_agenda",
  "radar_available_now",
  "verified_badge",
] as const;

/** Paywall — cartes fonctionnalités (titres/lignes/icônes) */
export const PAYWALL_FEATURES = [
  { title: "Voir qui m'a liké", line: "Plus de matchs pertinents, moins de hasard." },
  { title: "Filtres avancés", line: "Sport, moment, intention — des profils qui vous correspondent." },
  { title: "Passeport sportif", line: "Découvrez des profils dans une autre ville (week-end, voyage)." },
  { title: "Agenda sportif", line: "Indiquez vos créneaux ; voyez les compatibilités." },
];

/** Paywall — prix (modifiable) */
export const PAYWALL_PRICE_MONTHLY = "9,99";
export const PAYWALL_PRICE_PERIOD = "mois";
export const PAYWALL_PRICE_MONTHLY_FOUNDER = "9,99";
export const PAYWALL_PRICE_MONTHLY_STANDARD = "13,99";

export const ONE_SHOT_SECOND_CHANCE_OFFER = {
  id: "second_chance",
  featureKey: "second_chance",
  price: "1,49 €",
  packPrice: "3,99 €",
  monthlyIncluded: 1,
} as const;
