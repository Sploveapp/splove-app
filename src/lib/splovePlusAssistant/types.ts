/**
 * Assistant SPLove+ — types UI (v1 : suggestions déterministes depuis le profil).
 * Architecture préparée pour des enrichissements IA en v2 (voir TODO dans les modules associés).
 */

export type OutingType = "relaxation" | "leisure" | "intense" | "discovery";

export type AssistantSportCase = "single_common" | "multiple_common" | "no_common";

export type AssistantSportContext = {
  case: AssistantSportCase;
  /** Sports affichés dans le sélecteur — jamais inventés côté client. */
  selectableSports: string[];
  initialSport: string;
};

/**
 * Emplacements réservés pour des suggestions IA futures.
 * Non utilisés en v1 — voir commentaires TODO dans `resolveSportContext` et `buildSuggestedMessage`.
 */
export type AssistantAiSuggestionSlots = {
  /** TODO(v2-ai): lieu optimal selon sport, ville et habitudes des deux profils. */
  venue?: string | null;
  /** TODO(v2-ai): créneau optimal (ISO 8601) selon disponibilités et affinités. */
  scheduledAt?: string | null;
  /** TODO(v2-ai): message personnalisé selon le ton du fil et le contexte du match. */
  message?: string | null;
};

export type AssistantFormDraft = {
  sport: string;
  dateLocal: string;
  timeLocal: string;
  place: string;
  message: string;
};
