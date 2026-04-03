/**
 * Clés de matching : plusieurs slugs / libellés distincts à l’affichage peuvent
 * partager la même compatibilité (ex. Marche ↔ Randonnée, Fitness ↔ Musculation).
 */

const SLUG_TO_MATCH_GROUP: Record<string, string> = {
  marche: "walk-hike",
  randonnee: "walk-hike",
  "marche-randonnee": "walk-hike",
  fitness: "fitness-strength",
  musculation: "fitness-strength",
  "fitness-musculation": "fitness-strength",
};

/** Libellés FR historiques (ligne combinée ou sans slug). */
const LABEL_TO_MATCH_GROUP: Record<string, string> = {
  "marche / randonnée": "walk-hike",
  "fitness / musculation": "fitness-strength",
  marche: "walk-hike",
  randonnée: "walk-hike",
  fitness: "fitness-strength",
  musculation: "fitness-strength",
};

export function sportMatchKey(
  slug: string | null | undefined,
  label: string | null | undefined,
): string {
  const s = (slug ?? "").trim().toLowerCase();
  if (s && SLUG_TO_MATCH_GROUP[s]) {
    return `g:${SLUG_TO_MATCH_GROUP[s]}`;
  }
  const lab = (label ?? "").trim().toLowerCase();
  if (lab && LABEL_TO_MATCH_GROUP[lab]) {
    return `g:${LABEL_TO_MATCH_GROUP[lab]}`;
  }
  if (s) return `s:${s}`;
  return `l:${lab}`;
}

type SportRow = { slug?: string | null; label?: string | null };

export function collectSportMatchKeysFromProfile(profile: {
  profile_sports?: { sports?: SportRow | null }[] | null;
}): Set<string> {
  const list = profile.profile_sports ?? [];
  const keys = new Set<string>();
  for (const ps of list) {
    const sp = ps.sports;
    if (!sp) continue;
    keys.add(sportMatchKey(sp.slug ?? null, sp.label ?? null));
  }
  return keys;
}

/** Libellés affichables du profil cible qui sont compatibles avec au moins une clé « moi ». */
export function getSharedSportLabelsForMatch(
  myMatchKeys: Set<string>,
  profile: { profile_sports?: { sports?: SportRow | null }[] | null },
): string[] {
  const list = profile.profile_sports ?? [];
  const out: string[] = [];
  for (const ps of list) {
    const sp = ps.sports;
    const label = sp?.label?.trim();
    if (!label) continue;
    const k = sportMatchKey(sp?.slug ?? null, sp?.label ?? null);
    if (myMatchKeys.has(k)) out.push(label);
  }
  return out.sort((a, b) => a.localeCompare(b, "fr"));
}
