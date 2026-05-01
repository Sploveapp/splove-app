/**
 * Helpers partagés pour la carte Discover (projection IRL / sport commun).
 */

import { guidedProfileSentence } from "./discoverCardCopy";
import { getSharedSportLabelsForMatch } from "./sportMatchGroups";
import { isProfileActiveRecently } from "../services/splovePlus.service";

const activityLabelKeyMap: Record<string, string> = {
  "vient de rejoindre": "discover.activityNew",
  "actif recemment": "discover.activityRecently",
  "actif récemment": "discover.activityRecently",
  "actif aujourd'hui": "discover.activityToday",
  "actif aujourd’hui": "discover.activityToday",
  "profil a decouvrir": "discover.activityDiscover",
  "profil à découvrir": "discover.activityDiscover",
};

export function normalizeAliveLabelDiscover(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Première étiquette de sport commun entre le profil candidat et les clés du viewer. */
export function getSharedSport(
  profile: Parameters<typeof getSharedSportLabelsForMatch>[1],
  viewerSportMatchKeys: Set<string>,
): string | null {
  const labels = getSharedSportLabelsForMatch(viewerSportMatchKeys, profile);
  return labels[0] ?? null;
}

export type DiscoverIRLPromptProfile = {
  sport_phrase?: string | null;
  sport_feeling?: string | null;
  profile_sports?: { sports?: { slug?: string | null; label?: string | null } | null }[] | null;
};

/**
 * Phrase de projection terrain / IRL pour la carte Discover.
 * Réutilise `guidedProfileSentence` + sport commun lorsque pertinent.
 */
export function getIRLPrompt(
  profile: DiscoverIRLPromptProfile,
  viewerSportMatchKeys: Set<string>,
  copy: { realOutingIntent: string; genericFallback: string },
): string {
  const phraseTrim = (profile.sport_phrase ?? "").trim();
  const firstCommon = getSharedSport(profile, viewerSportMatchKeys);
  return guidedProfileSentence(
    {
      sport_phrase: phraseTrim ? null : profile.sport_phrase,
      sport_feeling: profile.sport_feeling,
      firstCommonSport: firstCommon,
      commonSportLineSuffix: copy.realOutingIntent,
      genericFallback: copy.genericFallback,
    },
    copy.realOutingIntent,
  );
}

/** Pour le badge « Actif aujourd’hui » — aligné sur le feed vivant ou activité très récente. */
export function shouldShowDiscoverActiveTodayBadge(profile: {
  activity_label?: string | null;
  last_active_at?: string | null;
}): boolean {
  const key =
    activityLabelKeyMap[normalizeAliveLabelDiscover(profile.activity_label)] ?? "";
  if (key === "discover.activityToday") return true;
  return isProfileActiveRecently(profile.last_active_at ?? null);
}
