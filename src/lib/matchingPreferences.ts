/**
 * Compatibilité genre / préférences « Je cherche » (aligné onboarding Discover).
 *
 * Valeurs attendues (BDD / onboarding) :
 * - `gender` : Femme | Homme | Non-binaire
 * - `looking_for` : Homme | Femme | Tous
 *
 * On évite le matching par sous-chaîne (.includes) : il peut valider des libellés
 * composés ou des données seedées hors format et laisser passer des profils non souhaités.
 */

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeGenderToken(s: string | null | undefined): string {
  return stripDiacritics((s ?? "").trim().toLowerCase());
}

/** Genre du profil cible — 3 valeurs produit + variantes pluriel / accents. */
function genderCanonical(raw: string | null | undefined): "femme" | "homme" | "nonbin" | null {
  const t = normalizeGenderToken(raw);
  if (!t) return null;
  if (t === "femme" || t === "femmes") return "femme";
  if (t === "homme" || t === "hommes") return "homme";
  if (t === "non-binaire" || t.startsWith("non-binaire")) return "nonbin";
  return null;
}

/** Préférence « intéressé(e) par » — 3 valeurs produit. */
function lookingForCanonical(raw: string | null | undefined): "femme" | "homme" | "tous" | null {
  const t = normalizeGenderToken(raw);
  if (!t) return null;
  if (t === "tous") return "tous";
  if (t === "femme" || t === "femmes") return "femme";
  if (t === "homme" || t === "hommes") return "homme";
  return null;
}

/**
 * La préférence `looking_for` accepte-t-elle le genre affiché sur le profil cible ?
 */
function lookingForAcceptsGender(lookingFor: string | null | undefined, targetGender: string | null | undefined): boolean {
  const want = lookingForCanonical(lookingFor);
  const gen = genderCanonical(targetGender);
  if (!want || !gen) return false;
  if (want === "tous") return true;
  if (want === "femme") return gen === "femme";
  if (want === "homme") return gen === "homme";
  return false;
}

/**
 * Double sens : je corresponde à ce qu’elle/cherche, elle/il à ce que je cherche.
 * `looking_for` ∈ { Homme, Femme, Tous }, `gender` ∈ { Femme, Homme, Non-binaire }.
 */
export function isPreferenceCompatible(
  me: { gender?: string | null; looking_for?: string | null },
  candidate: { gender?: string | null; looking_for?: string | null },
): boolean {
  if (!me.gender || !me.looking_for || !candidate.gender || !candidate.looking_for) return false;
  const iSeeThem = lookingForAcceptsGender(me.looking_for, candidate.gender);
  const theySeeMe = lookingForAcceptsGender(candidate.looking_for, me.gender);
  return iSeeThem && theySeeMe;
}
