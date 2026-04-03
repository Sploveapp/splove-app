/**
 * Constantes SPLove+
 */

export const PREMIUM_PLAN_ID = "plus";

export const BOOST_DURATION_MINUTES = 30;

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
