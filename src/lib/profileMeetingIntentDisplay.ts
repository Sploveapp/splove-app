import { PROFILE_INTENT_AMICAL, PROFILE_INTENT_AMOUR } from "./profileIntent";

export type ProfileMeetingIntentTier = "meet_new_people" | "something_more" | "lets_see";

const TIER_I18N: Record<ProfileMeetingIntentTier, string> = {
  meet_new_people: "intention_meet_new_people",
  something_more: "intention_something_more",
  lets_see: "intention_lets_see",
};

const TIER_EMOJI: Record<ProfileMeetingIntentTier, string> = {
  meet_new_people: "🤝",
  something_more: "❤️",
  lets_see: "😌",
};

/** Lecture affichage — alignée onboarding (`uiIntentFromDbIntent`), sans modifier la BDD. */
export function resolveProfileMeetingIntentTier(intent: unknown): ProfileMeetingIntentTier | null {
  if (typeof intent !== "string") return null;
  const raw = intent.trim();
  if (!raw) return null;
  const norm = raw.toLowerCase();
  if (
    norm === "friendly" ||
    norm === "amical" ||
    norm === PROFILE_INTENT_AMICAL.toLowerCase() ||
    norm === "activity_first" ||
    norm === "sport_social"
  ) {
    return "meet_new_people";
  }
  if (norm === "both" || norm === "open") return "lets_see";
  if (
    norm === "dating" ||
    norm === "amoureux" ||
    norm === PROFILE_INTENT_AMOUR.toLowerCase() ||
    norm === "open_to_dating" ||
    norm === "dating_feeling"
  ) {
    return "something_more";
  }
  return null;
}

/** Libellé badge profil : emoji + texte i18n (3 intentions onboarding). */
export function profileMeetingIntentBadgeLabel(
  intent: unknown,
  t: (key: string) => string,
): string | null {
  const tier = resolveProfileMeetingIntentTier(intent);
  if (!tier) return null;
  return `${TIER_EMOJI[tier]} ${t(TIER_I18N[tier])}`;
}
