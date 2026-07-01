/**
 * Coach SPLove+ — type de sortie et règles métier v1 (sans IA).
 * Les suggestions sport / message / créneau s'adaptent à ce choix.
 */

export type OutingType = "relaxation" | "leisure" | "intense" | "discovery";

export const OUTING_TYPES: OutingType[] = ["relaxation", "leisure", "intense", "discovery"];

export const DEFAULT_OUTING_TYPE: OutingType = "leisure";

type SportAffinityRule = {
  type: OutingType;
  patterns: string[];
  weight: number;
};

/** Heuristiques FR/EN sur les libellés sport déjà connus dans le profil. */
const SPORT_AFFINITY_RULES: SportAffinityRule[] = [
  { type: "relaxation", patterns: ["yoga", "pilates", "marche", "walk", "randonn", "hik", "stretch", "taï", "tai"], weight: 3 },
  { type: "relaxation", patterns: ["natation", "swim", "piscine"], weight: 2 },
  { type: "leisure", patterns: ["tennis", "padel", "badminton", "squash", "golf", "pétanque", "petanque"], weight: 3 },
  { type: "leisure", patterns: ["vélo", "velo", "cycl", "vtt", "bike", "basket", "foot", "futsal"], weight: 2 },
  { type: "intense", patterns: ["run", "course", "jogg", "trail", "crossfit", "muscu", "fitness", "hiit", "boxe", "box"], weight: 3 },
  { type: "intense", patterns: ["escalade", "climb", "triathlon", "rugby", "handball"], weight: 2 },
  { type: "discovery", patterns: ["tennis", "vélo", "velo", "yoga", "marche", "run", "course", "padel"], weight: 1 },
];

function normalizeSport(sport: string): string {
  return sport.trim().toLowerCase();
}

/** Score d'affinité d'un libellé sport pour un type de sortie (0 = neutre). */
export function scoreSportForOutingType(sport: string, outingType: OutingType): number {
  const s = normalizeSport(sport);
  if (!s) return 0;
  let score = 0;
  for (const rule of SPORT_AFFINITY_RULES) {
    if (rule.type !== outingType) continue;
    if (rule.patterns.some((p) => s.includes(p))) score += rule.weight;
  }
  return score;
}

/**
 * Trie les sports sélectionnables selon le type de sortie.
 * Ne crée jamais de sport — réordonne uniquement la liste fournie.
 */
export function rankSportsForOutingType(sports: string[], outingType: OutingType): string[] {
  const list = [...sports];
  if (list.length <= 1) return list;
  return list.sort((a, b) => {
    const diff = scoreSportForOutingType(b, outingType) - scoreSportForOutingType(a, outingType);
    if (diff !== 0) return diff;
    return a.localeCompare(b, "fr");
  });
}

/**
 * Choisit le sport recommandé pour le type de sortie.
 * Découverte sans sport commun : privilégie un sport du viewer (liste `userSports`).
 */
export function pickRecommendedSport(input: {
  outingType: OutingType;
  selectableSports: string[];
  sharedSports: string[];
  userSports: string[];
  sportCase: "single_common" | "multiple_common" | "no_common";
}): string {
  const { outingType, selectableSports, sharedSports, userSports, sportCase } = input;
  if (selectableSports.length === 0) return "";

  if (outingType === "discovery" && sportCase === "no_common") {
    const rankedUser = rankSportsForOutingType(userSports, "discovery");
    const fromUser = rankedUser.find((s) => selectableSports.some((x) => x.toLowerCase() === s.toLowerCase()));
    if (fromUser) return fromUser;
    const discoveryFriendly = rankSportsForOutingType(selectableSports, "discovery");
    return discoveryFriendly[0] ?? selectableSports[0]!;
  }

  if (outingType === "discovery" && sharedSports.length > 0) {
    const nonObvious = selectableSports.filter(
      (s) => !sharedSports.some((x) => x.toLowerCase() === s.toLowerCase()),
    );
    if (nonObvious.length > 0) {
      return rankSportsForOutingType(nonObvious, "discovery")[0]!;
    }
  }

  return rankSportsForOutingType(selectableSports, outingType)[0] ?? selectableSports[0]!;
}

function slotHour(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours();
}

function slotDay(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getDay();
}

/** Score un créneau ISO selon le type de sortie. */
export function scoreSlotForOutingType(iso: string, outingType: OutingType): number {
  const hour = slotHour(iso);
  const day = slotDay(iso);
  if (hour == null || day == null) return 0;

  const isWeekend = day === 0 || day === 6;
  let score = 0;

  switch (outingType) {
    case "relaxation":
      if (hour >= 14 && hour <= 17) score += 3;
      if (hour >= 18 && hour <= 19) score += 2;
      if (isWeekend) score += 2;
      if (hour >= 6 && hour <= 8) score -= 2;
      break;
    case "leisure":
      if (hour >= 18 && hour <= 20) score += 3;
      if (isWeekend && hour >= 10 && hour <= 12) score += 2;
      if (hour >= 12 && hour <= 14) score += 1;
      break;
    case "intense":
      if (hour >= 7 && hour <= 9) score += 3;
      if (hour >= 18 && hour <= 19) score += 2;
      if (hour >= 12 && hour <= 14) score -= 1;
      if (hour >= 20) score -= 2;
      break;
    case "discovery":
      if (isWeekend && hour >= 14 && hour <= 17) score += 3;
      if (hour >= 18 && hour <= 19) score += 2;
      if (isWeekend && hour >= 10 && hour <= 12) score += 1;
      break;
    default:
      break;
  }

  return score;
}

/** Choisit le meilleur créneau parmi ceux déjà calculés (disponibilités communes). */
export function pickBestSlotForOutingType(slots: string[], outingType: OutingType): string | null {
  const valid = slots.filter((iso) => !Number.isNaN(new Date(iso).getTime()));
  if (valid.length === 0) return null;
  return [...valid].sort((a, b) => scoreSlotForOutingType(b, outingType) - scoreSlotForOutingType(a, outingType))[0] ?? null;
}

/** Créneau par défaut quand aucune dispo commune n'est disponible. */
export function defaultScheduleForOutingType(outingType: OutingType): { date: string; time: string } {
  const base = new Date(Date.now() + 24 * 60 * 60 * 1000);
  switch (outingType) {
    case "relaxation":
      base.setHours(16, 0, 0, 0);
      break;
    case "leisure":
      base.setHours(18, 30, 0, 0);
      break;
    case "intense":
      base.setHours(8, 0, 0, 0);
      break;
    case "discovery":
      base.setHours(15, 0, 0, 0);
      break;
    default:
      base.setHours(18, 0, 0, 0);
  }
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 60_000);
  const iso = local.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export type CoachOutingSuggestions = {
  outingType: OutingType;
  recommendedSport: string;
  rankedSports: string[];
  bestSlotIso: string | null;
  defaultSchedule: { date: string; time: string };
};

/**
 * Agrège les suggestions Coach selon le type de sortie et les données déjà présentes.
 * TODO(v2-ai): fusionner avec le moteur IA pour affiner sport / créneau / message.
 */
export function buildCoachOutingSuggestions(input: {
  outingType: OutingType;
  selectableSports: string[];
  sharedSports: string[];
  userSports: string[];
  sportCase: "single_common" | "multiple_common" | "no_common";
  suggestedSlots: string[];
}): CoachOutingSuggestions {
  const recommendedSport = pickRecommendedSport({
    outingType: input.outingType,
    selectableSports: input.selectableSports,
    sharedSports: input.sharedSports,
    userSports: input.userSports,
    sportCase: input.sportCase,
  });
  const rankedSports = rankSportsForOutingType(input.selectableSports, input.outingType);
  const bestSlotIso = pickBestSlotForOutingType(input.suggestedSlots, input.outingType);
  const defaultSchedule = defaultScheduleForOutingType(input.outingType);

  return {
    outingType: input.outingType,
    recommendedSport,
    rankedSports,
    bestSlotIso,
    defaultSchedule,
  };
}
