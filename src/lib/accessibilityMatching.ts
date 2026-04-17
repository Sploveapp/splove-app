/**
 * Compatibilité « activités adaptées » entre deux profils.
 * Sans colonnes `pref_open_to_*` en base : comportement inclusif (pas d’exclusion).
 */
export type AccessibilityMatchingSlice = {
  needs_adapted_activities?: boolean | null;
};

export function mutualAccessibilityCompatible(
  _me: AccessibilityMatchingSlice,
  _other: AccessibilityMatchingSlice,
): boolean {
  return true;
}
