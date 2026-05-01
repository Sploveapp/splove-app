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
  /** Même préfixe que le slug (`s:…`) pour que deux profils avec le même mot (ex. skate) matchent même si l’un n’a que le libellé en base et l’autre le slug. */
  if (lab) return `s:${lab}`;
  return "s:";
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

/** Libellés affichés des sports du profil (tous sports, dédoublonnés). */
export function getProfileSportDisplayLabels(profile: {
  profile_sports?: { sports?: SportRow | null }[] | null;
}): string[] {
  const list = profile.profile_sports ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ps of list) {
    const sp = ps.sports;
    if (!sp) continue;
    const display = ((sp.label ?? "").trim() || (sp.slug ?? "").trim() || "").trim();
    if (!display) continue;
    const key = display.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(display);
  }
  return out.sort((a, b) => a.localeCompare(b, "fr"));
}

export type DiscoverSportChip = { label: string; shared: boolean };

/** Chips Discover : tous les sports avec indicateur si compatible avec mes clés. */
export function getDiscoverSportChips(profile: ProfileForSportChips, myMatchKeys: Set<string>): DiscoverSportChip[] {
  const labels = getProfileSportDisplayLabels(profile);
  const list = profile.profile_sports ?? [];
  const sharedByNormalizedLabel = new Map<string, boolean>();
  for (const ps of list) {
    const sp = ps.sports;
    if (!sp) continue;
    const display = ((sp.label ?? "").trim() || (sp.slug ?? "").trim() || "").trim();
    if (!display) continue;
    const k = sportMatchKey(sp.slug ?? null, sp.label ?? null);
    sharedByNormalizedLabel.set(display.toLowerCase(), myMatchKeys.has(k));
  }
  return labels.map((label) => ({
    label,
    shared: sharedByNormalizedLabel.get(label.toLowerCase()) === true,
  }));
}

type ProfileForSportChips = {
  profile_sports?: { sports?: SportRow | null }[] | null;
};

export function getSharedSportLabelsForMatch(
  myMatchKeys: Set<string>,
  profile: { profile_sports?: { sports?: SportRow | null }[] | null },
): string[] {
  const list = profile.profile_sports ?? [];
  const out: string[] = [];
  for (const ps of list) {
    const sp = ps.sports;
    if (!sp) continue;
    const k = sportMatchKey(sp?.slug ?? null, sp?.label ?? null);
    if (!myMatchKeys.has(k)) continue;
    const display =
      (sp.label ?? "").trim() || (sp.slug ?? "").trim() || "Sport";
    out.push(display);
  }
  return out.sort((a, b) => a.localeCompare(b, "fr"));
}
