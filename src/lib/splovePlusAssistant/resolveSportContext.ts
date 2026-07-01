import type { AssistantAiSuggestionSlots, AssistantSportContext } from "./types";

function dedupeSports(labels: string[]): string[] {
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

/**
 * Détermine le cas sport (1 / 2 / 3) et la liste sélectionnable pour l’Assistant SPLove+.
 * v1 : données profil uniquement. v2 : fusion possible avec `aiSlots` (non implémenté).
 */
export function resolveAssistantSportContext(
  sharedSports: string[],
  userSports: string[],
  _aiSlots?: AssistantAiSuggestionSlots,
): AssistantSportContext {
  // TODO(v2-ai): prioriser `aiSlots` pour pré-sélection sport / lieu / créneau si fourni par le moteur IA.
  void _aiSlots;

  const shared = dedupeSports(sharedSports);
  const user = dedupeSports(userSports);

  if (shared.length === 1) {
    return {
      case: "single_common",
      selectableSports: shared,
      initialSport: shared[0]!,
    };
  }

  if (shared.length > 1) {
    return {
      case: "multiple_common",
      selectableSports: shared,
      initialSport: shared[0]!,
    };
  }

  return {
    case: "no_common",
    selectableSports: user,
    initialSport: user[0] ?? "",
  };
}
