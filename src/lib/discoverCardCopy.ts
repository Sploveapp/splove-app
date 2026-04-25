/**
 * SPLove Discover / Match — formulations orientées action, sans lieu précis ni horaire exact.
 */

import { parseProfileIntent, PROFILE_INTENT_AMICAL } from "./profileIntent";

/** Phrase guidée unique (remplace la bio) — priorité au contenu saisi, puis ressenti court. */
export function guidedProfileSentence(input: {
  sport_phrase?: string | null;
  sport_feeling?: string | null;
  firstCommonSport: string | null;
  commonSportLineSuffix?: string;
  genericFallback?: string;
}): string {
  const phrase = input.sport_phrase?.trim();
  if (phrase) return phrase.length > 140 ? `${phrase.slice(0, 137).trim()}…` : phrase;
  const feel = input.sport_feeling?.trim();
  if (feel) return feel.length > 120 ? `${feel.slice(0, 117).trim()}…` : feel;
  if (input.firstCommonSport) {
    return `${input.firstCommonSport} — ${input.commonSportLineSuffix ?? "ready for a real outing."}`;
  }
  return input.genericFallback ?? "Envie de bouger ensemble, sans attendre.";
}

/** Libellé court d’intention (BDD : Amical | Amoureux). */
export function intentLabelShort(intent: unknown): string | null {
  const p = parseProfileIntent(intent);
  if (!p) return null;
  return p === PROFILE_INTENT_AMICAL ? "Amical" : "Amoureux";
}

/**
 * Raisons Discover affichables sur carte — évite le doublon distance si déjà en ligne dédiée.
 */
export function filterDiscoverReasonsForDisplay(
  reasons: string[],
  locLine1: string | null,
): string[] {
  const locHasKm = locLine1 != null && locLine1.toLowerCase().includes("km");
  const out: string[] = [];
  for (const r of reasons) {
    const t = r.trim();
    if (!t) continue;
    if (locHasKm && t.toLowerCase().includes("km")) continue;
    out.push(t);
    if (out.length >= 3) break;
  }
  return out;
}

/** Indication de zone floue — jamais de distance km exacte sans géoloc serveur. */
export function softAreaHint(
  viewerCity: string | null,
  profileCity: string | null | undefined,
  labels?: { nearby?: string; twoSectors?: string },
): string | null {
  const b = profileCity?.trim();
  if (!b) return null;
  const a = viewerCity?.trim();
  if (a && a.toLowerCase() === b.toLowerCase()) {
    return labels?.nearby ?? "Secteur voisin du vôtre (indication profil)";
  }
  return labels?.twoSectors ?? "Deux secteurs — à cadrer sur un créneau commun";
}

/** Écran match — phrase d’élan (pas de lieu ni horaire précis). */
export function matchMomentumLine(sharedSports: string[]): string {
  if (sharedSports.length > 0) {
    const s = sharedSports[0]!;
    return `Vous partagez ${s} : un premier créneau suffit pour lancer le réel.`;
  }
  return "Le match est là — proposez une sortie tant que l’élan est chaud.";
}
