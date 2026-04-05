/**
 * SPLove Discover / Match — formulations orientées action, sans lieu précis ni horaire exact.
 */

/** Phrase guidée unique (remplace la bio) — priorité au contenu saisi. */
export function guidedProfileSentence(input: {
  sport_phrase?: string | null;
  firstCommonSport: string | null;
}): string {
  const phrase = input.sport_phrase?.trim();
  if (phrase) return phrase;
  if (input.firstCommonSport) {
    return `${input.firstCommonSport} — envie d’une vraie sortie.`;
  }
  return "Envie de bouger ensemble, sans attendre.";
}

/** Premier moment IRL — une courte phrase ; vide si absent. */
export function premierMomentLine(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  return t && t.length > 0 ? t : null;
}

/** Indication de zone floue — jamais de distance km exacte sans géoloc serveur. */
export function softAreaHint(
  viewerCity: string | null,
  profileCity: string | null | undefined
): string | null {
  const b = profileCity?.trim();
  if (!b) return null;
  const a = viewerCity?.trim();
  if (a && a.toLowerCase() === b.toLowerCase()) {
    return "Secteur voisin du vôtre (indication profil)";
  }
  return "Deux secteurs — à cadrer sur un créneau commun";
}

/** Écran match — phrase d’élan (pas de lieu ni horaire précis). */
export function matchMomentumLine(sharedSports: string[]): string {
  if (sharedSports.length > 0) {
    const s = sharedSports[0]!;
    return `Vous partagez ${s} : un premier créneau suffit pour lancer le réel.`;
  }
  return "Le match est là — proposez une sortie tant que l’élan est chaud.";
}
