/**
 * Compatibilité genre / préférences « Je cherche » (aligné onboarding Discover).
 */

function normalizeGenderToken(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function lookingForIncludesGender(lookingFor: string | null | undefined, targetGender: string | null | undefined): boolean {
  const lf = normalizeGenderToken(lookingFor);
  const g = normalizeGenderToken(targetGender);
  if (!lf || !g) return false;
  if (lf.includes("tous")) return true;
  if (lf.includes("femme") && g.includes("femme")) return true;
  if (lf.includes("homme") && g.includes("homme") && !g.includes("femme")) return true;
  if (lf.includes("non") && g.includes("non")) return true;
  return false;
}

/**
 * Double sens : je corresponde à ce qu’elle/cherche, elle/il à ce que je cherche.
 * `looking_for` ∈ { Homme, Femme, Tous }, `gender` ∈ { Femme, Homme, Non-binaire }.
 */
export function isPreferenceCompatible(
  me: { gender?: string | null; looking_for?: string | null },
  candidate: { gender?: string | null; looking_for?: string | null }
): boolean {
  if (!me.gender || !me.looking_for || !candidate.gender || !candidate.looking_for) return false;
  const iSeeThem = lookingForIncludesGender(me.looking_for, candidate.gender);
  const theySeeMe = lookingForIncludesGender(candidate.looking_for, me.gender);
  return iSeeThem && theySeeMe;
}
