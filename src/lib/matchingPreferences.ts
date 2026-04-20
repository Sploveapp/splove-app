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

/** Genre du profil cible — 3 valeurs produit + variantes pluriel / accents + libellés EN (seed / tests). */
function genderCanonical(raw: string | null | undefined): "femme" | "homme" | "nonbin" | null {
  const t = normalizeGenderToken(raw);
  if (!t) return null;
  if (t === "femme" || t === "femmes") return "femme";
  if (t === "homme" || t === "hommes") return "homme";
  if (t === "female" || t === "woman" || t === "women") return "femme";
  if (t === "male" || t === "man" || t === "men") return "homme";
  if (t === "non-binaire" || t.startsWith("non-binaire") || t === "nonbinary" || t === "non-binary") {
    return "nonbin";
  }
  return null;
}

/** Préférence « intéressé(e) par » — 3 valeurs produit (+ EN alignés). */
function lookingForCanonical(raw: string | null | undefined): "femme" | "homme" | "tous" | null {
  const t = normalizeGenderToken(raw);
  if (!t) return null;
  if (t === "tous" || t === "all" || t === "everyone") return "tous";
  if (t === "femme" || t === "femmes" || t === "women" || t === "female") return "femme";
  if (t === "homme" || t === "hommes" || t === "men" || t === "male") return "homme";
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
/** Champs nécessaires au filtre (viewer ou profil candidat). */
export type PreferenceCompatFields = {
  gender?: string | null;
  looking_for?: string | null;
};

/**
 * Source unique produit : compatibilité mutuelle genre / « je cherche ».
 * Toutes les surfaces (Discover, LikesYou, SPLove+) doivent s’appuyer sur ce helper uniquement.
 */
export function isPreferenceCompatible(
  me: PreferenceCompatFields,
  candidate: PreferenceCompatFields,
): boolean {
  if (!me.gender || !me.looking_for || !candidate.gender || !candidate.looking_for) return false;
  const iSeeThem = lookingForAcceptsGender(me.looking_for, candidate.gender);
  const theySeeMe = lookingForAcceptsGender(candidate.looking_for, me.gender);
  return iSeeThem && theySeeMe;
}

/**
 * Filtre strict : uniquement `isPreferenceCompatible` (aucune règle plus souple).
 */
export function filterCandidatesByPreferenceCompatibility<T extends PreferenceCompatFields>(
  viewer: PreferenceCompatFields,
  candidates: readonly T[],
): T[] {
  return candidates.filter((c) => isPreferenceCompatible(viewer, c));
}

/**
 * Likes reçus : la compatibilité s’applique au profil **liker** (`row.profile`).
 */
export function filterLikeRowsByViewerPreference<
  R extends { profile?: PreferenceCompatFields | null | undefined },
>(viewer: PreferenceCompatFields, rows: readonly R[]): R[] {
  return rows.filter((row) => {
    const p = row.profile;
    if (!p) return false;
    return isPreferenceCompatible(viewer, p);
  });
}

export function logPreferenceCompatibilityPipeline(
  surface: "Discover" | "LikesYou" | "SplovePlus",
  viewer: PreferenceCompatFields,
  beforeCount: number,
  afterCount: number,
  renderedNames: string[],
): void {
  console.log(`[${surface}] preferenceCompat pipeline`, {
    viewer,
    beforeCount,
    afterCount,
    renderedNames,
  });
}
