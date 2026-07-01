/**
 * Cache session des libellés sport du viewer pour l’Assistant SPLove+ (cas sans sport commun).
 * Alimenté par Discover / Profil — lecture seule côté Chat, sans requête supplémentaire.
 */

const KEY_PREFIX = "splove_viewer_sport_labels_";

function dedupeLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.sort((a, b) => a.localeCompare(b, "fr"));
}

/** Persiste les sports du profil viewer pour l’Assistant (appelé après chargement profil / Discover). */
export function cacheViewerSportLabelsForAssistant(userId: string, labels: string[]): void {
  if (!userId || typeof window === "undefined") return;
  const normalized = dedupeLabels(labels);
  if (normalized.length === 0) return;
  try {
    window.sessionStorage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify(normalized));
  } catch {
    /* quota */
  }
}

/** Lit les sports du viewer depuis le cache session (vide si jamais alimenté). */
export function readViewerSportLabelsFromSession(userId: string): string[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(`${KEY_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return dedupeLabels(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return [];
  }
}

const PARTNER_CITY_PREFIX = "splove_conv_partner_city_";

export function cachePartnerCityForConversation(conversationId: string, city: string | null | undefined): void {
  if (!conversationId || typeof window === "undefined") return;
  const label = (city ?? "").trim();
  if (!label) return;
  try {
    window.sessionStorage.setItem(`${PARTNER_CITY_PREFIX}${conversationId}`, label);
  } catch {
    /* quota */
  }
}

export function readPartnerCityFromSession(conversationId: string): string | null {
  if (!conversationId || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${PARTNER_CITY_PREFIX}${conversationId}`);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

const MATCH_DISTANCE_PREFIX = "splove_conv_match_distance_km_";

export function cacheMatchDistanceForConversation(
  conversationId: string,
  distanceKm: number | null | undefined,
): void {
  if (!conversationId || typeof window === "undefined") return;
  if (distanceKm == null || !Number.isFinite(distanceKm)) return;
  try {
    window.sessionStorage.setItem(`${MATCH_DISTANCE_PREFIX}${conversationId}`, String(distanceKm));
  } catch {
    /* quota */
  }
}

export function readMatchDistanceFromSession(conversationId: string): number | null {
  if (!conversationId || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${MATCH_DISTANCE_PREFIX}${conversationId}`);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
