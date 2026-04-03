/**
 * Compatibilité « activités adaptées » entre deux profils : réciproque.
 * Les préférences absentes ou null sont traitées comme true (comportement inclusif par défaut).
 */
export type AccessibilityMatchingSlice = {
  needs_adapted_activities?: boolean | null;
  pref_open_to_standard_activity?: boolean | null;
  pref_open_to_adapted_activity?: boolean | null;
};

function wantsOpenToStandard(p: AccessibilityMatchingSlice): boolean {
  return p.pref_open_to_standard_activity !== false;
}

function wantsOpenToAdapted(p: AccessibilityMatchingSlice): boolean {
  return p.pref_open_to_adapted_activity !== false;
}

export function mutualAccessibilityCompatible(
  me: AccessibilityMatchingSlice,
  other: AccessibilityMatchingSlice,
): boolean {
  const otherUsesAdapted = !!other.needs_adapted_activities;
  const meUsesAdapted = !!me.needs_adapted_activities;

  const iAcceptThem =
    (!otherUsesAdapted && wantsOpenToStandard(me)) ||
    (otherUsesAdapted && wantsOpenToAdapted(me));

  const theyAcceptMe =
    (!meUsesAdapted && wantsOpenToStandard(other)) ||
    (meUsesAdapted && wantsOpenToAdapted(other));

  return iAcceptThem && theyAcceptMe;
}
