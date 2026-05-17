import {
  isStrictFemmeHommePair,
  profileGenderBucket,
} from "./chatFirstMessagePolicy";
import {
  isFriendshipIntentPair,
  parseProfileIntent,
  PROFILE_INTENT_AMOUR,
} from "./profileIntent";

export type MatchIntroVariant =
  | "hetero_femme"
  | "hetero_homme"
  | "same_gender_start"
  | "same_gender_wait"
  | "generic";

export function resolveMatchIntroVariant(params: {
  myUserId: string;
  matchedByUserId: string | null;
  myGender: string | null | undefined;
  myIntent: unknown;
  partnerGender: string | null | undefined;
  partnerIntent: unknown;
}): MatchIntroVariant {
  if (isFriendshipIntentPair(params.myIntent, params.partnerIntent)) {
    return "generic";
  }

  const mine = parseProfileIntent(params.myIntent);
  const theirs = parseProfileIntent(params.partnerIntent);
  if (mine !== PROFILE_INTENT_AMOUR || theirs !== PROFILE_INTENT_AMOUR) {
    return "generic";
  }

  if (isStrictFemmeHommePair(params.myGender, params.partnerGender)) {
    return profileGenderBucket(params.myGender) === "femme" ? "hetero_femme" : "hetero_homme";
  }

  const starterId = params.matchedByUserId?.trim() ?? "";
  if (starterId && starterId === params.myUserId) {
    return "same_gender_start";
  }
  return "same_gender_wait";
}

export function matchIntroShowsSecondary(variant: MatchIntroVariant): boolean {
  return variant === "hetero_homme" || variant === "same_gender_wait" || variant === "generic";
}

export function matchIntroPrimaryOpensActivity(variant: MatchIntroVariant): boolean {
  return variant === "hetero_homme" || variant === "same_gender_wait";
}
