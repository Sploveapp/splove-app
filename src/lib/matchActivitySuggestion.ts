/**
 * Suggestions d’activité post-match (copy + tonalité) selon sport commun et rythmes de pratique.
 */

import type { Language } from "../i18n";
import { translate } from "../i18n";
import { parseSportPracticePace, type SportPracticePace } from "./sportPracticePace";

export type MatchActivitySuggestionTone = "soft" | "active" | "adaptive";

export type MatchActivitySuggestion = {
  title: string;
  subtitle: string;
  tone: MatchActivitySuggestionTone;
};

export type MatchSuggestionScenarioKind = "adapted" | "dual_flexible" | "dual_solo" | "fallback";

export function classifyMatchActivityScenario(
  current: SportPracticePace | null,
  matched: SportPracticePace | null,
): MatchSuggestionScenarioKind {
  if (current === "adapted" || matched === "adapted") return "adapted";
  if (current === "flexible" && matched === "flexible") return "dual_flexible";
  if (current === "solo" && matched === "solo") return "dual_solo";
  return "fallback";
}

function toneForScenario(kind: MatchSuggestionScenarioKind): MatchActivitySuggestionTone {
  if (kind === "adapted") return "adaptive";
  if (kind === "dual_flexible") return "active";
  return "soft";
}

/** @param locale — même convention que `useTranslation().language`. */
/** sessionStorage — ne pas casser si indisponible (quota / private mode). */
export function isActivitySuggestionDismissedInStorage(conversationId: string): boolean {
  if (typeof window === "undefined" || !conversationId) return false;
  try {
    return window.sessionStorage.getItem(`splove_match_activity_suggestion_dismiss_${conversationId}`) === "1";
  } catch {
    return false;
  }
}

export function setActivitySuggestionDismissedInStorage(conversationId: string): void {
  if (typeof window === "undefined" || !conversationId) return;
  try {
    window.sessionStorage.setItem(`splove_match_activity_suggestion_dismiss_${conversationId}`, "1");
  } catch {
    /* ignore */
  }
}

export function getActivitySuggestion(input: {
  sharedSport: string;
  currentUserPracticeType: string | null | undefined;
  matchedUserPracticeType: string | null | undefined;
  locale: Language;
}): MatchActivitySuggestion {
  const sport = (typeof input.sharedSport === "string" ? input.sharedSport : "").trim() || "—";
  const me = parseSportPracticePace(input.currentUserPracticeType);
  const them = parseSportPracticePace(input.matchedUserPracticeType);
  const scenario = classifyMatchActivityScenario(me, them);
  const tone = toneForScenario(scenario);

  const keyPrefix =
    scenario === "adapted"
      ? "match_suggestion.adapted"
      : scenario === "dual_flexible"
        ? "match_suggestion.flexible"
        : scenario === "dual_solo"
          ? "match_suggestion.solo"
          : "match_suggestion.fallback";

  return {
    title: translate(input.locale, `${keyPrefix}_title`, { sport }),
    subtitle: translate(input.locale, `${keyPrefix}_subtitle`, { sport }),
    tone,
  };
}
