/** z-index de la barre d’onglets fixe (sous modales plein écran, au-dessus du contenu). */
export const SPLOVE_BOTTOM_NAV_Z_INDEX = 50;

/** Hauteur de la pilule (icônes 24 + libellés 10) — inchangée. */
export const SPLOVE_BOTTOM_NAV_PILL_HEIGHT_PX = 44;

/**
 * Espace entre le bas des libellés et le début de la safe area (Home Indicator).
 * Réduit pour rapprocher la pilule du bas de l’écran ; la safe area reste intégrale.
 */
export const SPLOVE_BOTTOM_NAV_LABEL_TO_SAFE_GAP_PX = 4;

/**
 * Hauteur réelle de la barre web (pilule + gap + safe area).
 * Source unique pour `--splove-bottom-nav-height` (fallback) et le padding du contenu.
 */
export const SPLOVE_BOTTOM_NAV_HEIGHT_FALLBACK = `calc(${SPLOVE_BOTTOM_NAV_PILL_HEIGHT_PX}px + ${SPLOVE_BOTTOM_NAV_LABEL_TO_SAFE_GAP_PX}px + env(safe-area-inset-bottom, 0px))`;

/**
 * Hauteur contenu barre native — injectée par iOS (`SPLoveBridgeViewController`).
 * 0 px par défaut (Android / web) : seule la safe area système s’applique.
 */
export const SPLOVE_NATIVE_BOTTOM_NAV_CONTENT_HEIGHT_VAR =
  "--splove-native-bottom-nav-content-height";

/**
 * Clearance basse native : hauteur contenu barre + safe area (une seule fois).
 */
export const SPLOVE_BOTTOM_CLEARANCE =
  "calc(var(--splove-native-bottom-nav-content-height, 0px) + env(safe-area-inset-bottom, 0px))";

/** Alias shell authentifié iOS natif — même formule que {@link SPLOVE_BOTTOM_CLEARANCE}. */
export const SPLOVE_NATIVE_BOTTOM_NAV_HEIGHT_FALLBACK = SPLOVE_BOTTOM_CLEARANCE;

/** max-height sheets profil — viewport moins safe areas et barre native. */
export const SPLOVE_PROFILE_SHEET_MAX_HEIGHT =
  "calc(100dvh - env(safe-area-inset-top, 0px) - var(--splove-native-bottom-nav-content-height, 0px) - env(safe-area-inset-bottom, 0px))";

/** Variable CSS unique : hauteur réelle de la bottom nav (mesurée ou fallback). */
export const SPLOVE_BOTTOM_NAV_HEIGHT_VAR = "--splove-bottom-nav-height";
