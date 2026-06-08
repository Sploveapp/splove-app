/** z-index de la barre d’onglets fixe (sous modales plein écran, au-dessus du contenu). */
export const SPLOVE_BOTTOM_NAV_Z_INDEX = 50;

/** Repli si la hauteur n’est pas encore mesurée (padding nav + safe area). */
export const SPLOVE_BOTTOM_NAV_HEIGHT_FALLBACK =
  "calc(78px + env(safe-area-inset-bottom, 0px))";

/**
 * Hauteur contenu barre native — injectée par iOS (`SPLoveBridgeViewController`).
 * 0 px par défaut (Android / web) : seule la safe area système s’applique.
 */
export const SPLOVE_NATIVE_BOTTOM_NAV_CONTENT_HEIGHT_VAR =
  "--splove-native-bottom-nav-content-height";

/**
 * Clearance basse : barre native (si présente) + safe area iOS/Android.
 * Aucune marge fixe additionnelle.
 */
export const SPLOVE_BOTTOM_CLEARANCE =
  "calc(var(--splove-native-bottom-nav-content-height, 0px) + env(safe-area-inset-bottom, 0px))";

/** Alias shell authentifié iOS natif — même formule que {@link SPLOVE_BOTTOM_CLEARANCE}. */
export const SPLOVE_NATIVE_BOTTOM_NAV_HEIGHT_FALLBACK = SPLOVE_BOTTOM_CLEARANCE;

/** max-height sheets profil — viewport moins safe areas et barre native. */
export const SPLOVE_PROFILE_SHEET_MAX_HEIGHT =
  "calc(100dvh - env(safe-area-inset-top, 0px) - var(--splove-native-bottom-nav-content-height, 0px) - env(safe-area-inset-bottom, 0px))";

export const SPLOVE_BOTTOM_NAV_HEIGHT_VAR = "--splove-bottom-nav-height";
