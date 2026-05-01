/**
 * Sports proposés en premier à l’onboarding (slug Supabase canonique — voir migrations sports).
 */

export const ONBOARDING_QUICK_PICK_SLUGS: readonly string[] = [
  "course-a-pied",
  "randonnee",
  "padel",
  "tennis",
  "fitness",
  "velo",
  "natation",
  "football",
  "marche",
  "skate",
  "petanque",
] as const;

const DIACRITIC_RE = /\p{Diacritic}/gu;

export function normalizeSportSearchText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(DIACRITIC_RE, "")
    .toLowerCase()
    .trim();
}

/**
 * Aligné avec la consigne : au moins 3 caractères saisis ;
 * le sport correspond si son libellé (nom + catégorie) commence par les mêmes 3 lettres normalisées.
 */
export function sportMatchesFirstThreeLetters(sportHaystack: string, queryRaw: string): boolean {
  const q = normalizeSportSearchText(queryRaw);
  if (q.length < 3) return false;
  const prefix = q.slice(0, 3);
  const hay = normalizeSportSearchText(sportHaystack);
  return hay.startsWith(prefix);
}

export function orderedQuickPickSports<T extends { slug?: string | null; id?: string | number }>(
  catalog: T[],
): T[] {
  const bySlug = new Map<string, T>();
  for (const row of catalog) {
    const s = typeof row.slug === "string" ? row.slug.trim().toLowerCase() : "";
    if (s && !bySlug.has(s)) bySlug.set(s, row);
  }
  const out: T[] = [];
  for (const slug of ONBOARDING_QUICK_PICK_SLUGS) {
    const hit = bySlug.get(slug);
    if (hit) out.push(hit);
  }
  return out;
}
