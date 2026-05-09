/**
 * Raisons de scoring Discover : stockées comme clés i18n + JSON optionnel (pas de texte naturel en dur).
 */

export function encodeDiscoverScoringReason(
  key: string,
  params?: Record<string, string | number>,
): string {
  if (!params || Object.keys(params).length === 0) return key;
  return `${key}|${JSON.stringify(params)}`;
}

export type DecodedDiscoverScoringReason = { key: string; params?: Record<string, unknown> };

export function decodeDiscoverScoringReason(raw: string): DecodedDiscoverScoringReason {
  const pipe = raw.indexOf("|");
  if (pipe < 0) return { key: raw };
  const keyPart = raw.slice(0, pipe);
  try {
    const params = JSON.parse(raw.slice(pipe + 1)) as Record<string, unknown>;
    return { key: keyPart, params };
  } catch {
    return { key: raw };
  }
}

/** Convertit les raisons encodées en chaînes localisées (pour affichage / debug uniquement si besoin). */
export function mapDiscoverReasonsWithI18n(
  reasons: string[],
  t: (key: string, vars?: Record<string, string | number>) => string,
): string[] {
  return reasons.map((raw) => {
    const { key, params } = decodeDiscoverScoringReason(raw);
    if (!params || Object.keys(params).length === 0) return t(key);
    const vars = params as Record<string, string | number>;
    return t(key, vars);
  });
}
