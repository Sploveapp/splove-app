import type { Language } from "../../i18n";
import type { AssistantAiSuggestionSlots, OutingType } from "./types";
import { DEFAULT_OUTING_TYPE } from "./coachOutingRules";

function activityInviteLine(sport: string, language: Language, outingType: OutingType): string {
  const s = sport.trim().toLowerCase();
  if (language === "en") {
    if (outingType === "relaxation") return "How about a relaxed session this week? 😊";
    if (outingType === "intense") return "Up for pushing ourselves together this week? 💪";
    if (outingType === "discovery") return `Want to try ${sport} with me this week? 😊`;
    if (s.includes("tennis") || s.includes("padel")) return "Fancy a game this week? 😊";
    if (s.includes("run") || s.includes("course") || s.includes("jogg")) return "Up for a run this week? 😊";
    if (s.includes("vélo") || s.includes("velo") || s.includes("cycl") || s.includes("bike"))
      return "Want to ride together this week? 😊";
    return `Up for trying ${sport} together this week? 😊`;
  }
  if (outingType === "relaxation") return "Et si on se faisait une sortie cool et détente cette semaine ? 😊";
  if (outingType === "intense") return "Ça te dit de se challenger ensemble cette semaine ? 💪";
  if (outingType === "discovery") return `Ça te dirait de découvrir le ${sport.toLowerCase()} avec moi ? 😊`;
  if (s.includes("tennis") || s.includes("padel")) return "Ça te dirait une partie cette semaine ? 😊";
  if (s.includes("run") || s.includes("course") || s.includes("jogg")) return "Ça te dirait une sortie cette semaine ? 😊";
  if (s.includes("vélo") || s.includes("velo") || s.includes("cycl") || s.includes("vtt"))
    return "Ça te dirait une sortie vélo cette semaine ? 😊";
  return `Ça te dirait une sortie ${sport} cette semaine ? 😊`;
}

function commonSportOpener(sport: string, language: Language, outingType: OutingType): string {
  const s = sport.toLowerCase();
  if (language === "en") {
    if (outingType === "relaxation") return `We both enjoy ${s} — perfect for something easy-going.`;
    if (outingType === "intense") return `We both love ${s} — ready for a solid session?`;
    if (outingType === "discovery") return `We both like ${s}, but I'd love to try it together in a new way.`;
    return `We both love ${s}.`;
  }
  if (outingType === "relaxation") return `On aime tous les deux le ${s} — parfait pour une sortie sans pression.`;
  if (outingType === "intense") return `On aime tous les deux le ${s} — prêt·e à enchaîner ?`;
  if (outingType === "discovery") return `On aime tous les deux le ${s}, mais j'aimerais qu'on le découvre autrement.`;
  return `On aime tous les deux le ${s}.`;
}

/**
 * Message d’accroche prérempli pour l’Assistant (v1 : templates + type de sortie, pas d’IA).
 */
export function buildAssistantSuggestedMessage(input: {
  sport: string;
  hasCommonSport: boolean;
  language: Language;
  outingType?: OutingType;
  aiSlots?: AssistantAiSuggestionSlots;
}): string {
  // TODO(v2-ai): remplacer par `aiSlots.message` lorsque le moteur IA sera branché.
  if (input.aiSlots?.message?.trim()) {
    return input.aiSlots.message.trim();
  }

  const sport = input.sport.trim();
  const outingType = input.outingType ?? DEFAULT_OUTING_TYPE;

  if (input.language === "en") {
    if (outingType === "discovery" || !input.hasCommonSport) {
      if (sport) {
        return `Hi!\n\nI'd love to share ${sport.toLowerCase()} with you.\n\n${activityInviteLine(sport, "en", outingType)}`;
      }
      return "Hi!\n\nI'd love to share an activity I'm really into.\n\nWant to try it with me? 😊";
    }
    if (sport) {
      return `Hi!\n\n${commonSportOpener(sport, "en", outingType)}\n\n${activityInviteLine(sport, "en", outingType)}`;
    }
    return "Hi!\n\nWant to plan something sporty together this week? 😊";
  }

  if (outingType === "discovery" || !input.hasCommonSport) {
    if (sport) {
      return `Salut !\n\nJ'aimerais te faire découvrir le ${sport.toLowerCase()}.\n\n${activityInviteLine(sport, "fr", outingType)}`;
    }
    return "Salut !\n\nJ'aimerais te faire découvrir une activité que j'aime beaucoup.\n\nÇa te dirait d'essayer avec moi ? 😊";
  }

  if (sport) {
    return `Salut !\n\n${commonSportOpener(sport, "fr", outingType)}\n\n${activityInviteLine(sport, "fr", outingType)}`;
  }

  return "Salut !\n\nÇa te dirait de caler une sortie sport ensemble cette semaine ? 😊";
}

/**
 * Citation affichée sur la carte récap Coach (sans salutation — ton posé et personnel).
 */
export function buildCoachPreviewQuote(input: {
  sport: string;
  hasCommonSport: boolean;
  language: Language;
  outingType?: OutingType;
}): string {
  const sport = input.sport.trim();
  const sportLower = sport.toLowerCase();
  const outingType = input.outingType ?? DEFAULT_OUTING_TYPE;

  if (input.language === "en") {
    if (input.hasCommonSport && sport) {
      if (sportLower.includes("tennis") || sportLower.includes("padel")) {
        return `You both love ${sportLower}.\nWhy not set up a game this week?`;
      }
      if (outingType === "intense") {
        return `You both love ${sportLower}.\nReady to push yourselves together this week?`;
      }
      if (outingType === "relaxation") {
        return `You both enjoy ${sportLower}.\nHow about an easy-going session this week?`;
      }
      return `You both love ${sportLower}.\nWant to plan something this week?`;
    }
    if (sport) {
      return `I'd love to introduce you to ${sportLower}.\nWant to try it together this week?`;
    }
    return "I'd love to share an activity I'm into.\nWant to try it with me this week?";
  }

  if (input.hasCommonSport && sport) {
    if (sportLower.includes("tennis") || sportLower.includes("padel")) {
      return `Vous aimez tous les deux le ${sportLower}.\nPourquoi ne pas organiser une partie cette semaine ?`;
    }
    if (outingType === "intense") {
      return `Vous aimez tous les deux le ${sportLower}.\nÇa vous dirait de vous challenger cette semaine ?`;
    }
    if (outingType === "relaxation") {
      return `Vous aimez tous les deux le ${sportLower}.\nEt si on calait une sortie détente cette semaine ?`;
    }
    if (outingType === "discovery") {
      return `Vous aimez tous les deux le ${sportLower}.\nEt si on le découvrait autrement cette semaine ?`;
    }
    return `Vous aimez tous les deux le ${sportLower}.\nÇa vous dirait une sortie cette semaine ?`;
  }

  if (sport) {
    return `J'aimerais vous faire découvrir le ${sportLower}.\nÇa vous dirait d'essayer ensemble cette semaine ?`;
  }

  return "J'aimerais partager une activité que j'aime.\nÇa vous dirait d'essayer avec moi cette semaine ?";
}
