/**
 * Règles produit — premier contact post-match :
 *
 * **`hasConversationStarted`** : au moins un vrai message texte libre (jamais une proposition d’activité).
 * - Amical / intents mixtes : n’importe quel texte libre.
 * - Amoureux F/H : premier texte libre de la femme.
 * - Amoureux même genre : premier texte libre de `initiator_user`.
 *
 * **Chat texte** : avant ouverture, seul l’auteur autorisé peut composer ; ensuite les deux.
 * **Activité (chat)** : indépendant du premier message texte (ex. homme F/H peut proposer un créneau).
 */

import {
  parseProfileIntent,
  PROFILE_INTENT_AMOUR,
  isFriendshipIntentPair,
} from "./profileIntent";

export type ProfileGenderBucket = "femme" | "homme" | "nonbin" | null;

function normalizeGenderToken(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Genre profil (onboarding `female`/`male`, legacy `Femme`/`Homme`, EN woman/man). */
export function profileGenderBucket(gender: string | null | undefined): ProfileGenderBucket {
  const t = normalizeGenderToken(gender);
  if (!t) return null;
  if (t === "femme" || t === "femmes" || t === "female" || t === "woman" || t === "women") {
    return "femme";
  }
  if (t === "homme" || t === "hommes" || t === "male" || t === "man" || t === "men") {
    return "homme";
  }
  if (
    t === "non-binaire" ||
    t.startsWith("non-binaire") ||
    t === "nonbinary" ||
    t === "non-binary" ||
    t === "non_binary"
  ) {
    return "nonbin";
  }
  return null;
}

/** Couple hétéro classique femme + homme (tous genres reconnus par l’app). */
export function isStrictFemmeHommePair(
  genderA: string | null | undefined,
  genderB: string | null | undefined,
): boolean {
  const a = profileGenderBucket(genderA);
  const b = profileGenderBucket(genderB);
  return (a === "femme" && b === "homme") || (a === "homme" && b === "femme");
}

function isSameGenderFemmeFemmeOrHommeHommePair(
  genderA: string | null | undefined,
  genderB: string | null | undefined,
): boolean {
  const a = profileGenderBucket(genderA);
  const b = profileGenderBucket(genderB);
  return (a === "femme" && b === "femme") || (a === "homme" && b === "homme");
}

export function findFemmeProfileIdInPair(
  profiles: { id: string; gender?: string | null }[],
): string | null {
  const femme = profiles.find((p) => profileGenderBucket(p.gender) === "femme");
  return femme?.id ?? null;
}

export type ChatMessageForFirstPolicy = {
  sender_id: string;
  message_type?: string | null;
};

/** Message hors carte / réponse structurée activité — compte pour le chat texte libre. */
export function isFreeTextChatMessage(msg: { message_type?: string | null }): boolean {
  const mt = (msg.message_type ?? "text").trim().toLowerCase();
  if (!mt || mt === "text") return true;
  return mt !== "activity_proposal" && mt !== "activity_proposal_response";
}

function femmeUserIdInPair(params: {
  myUserId: string;
  partnerUserId: string;
  myGender: string | null | undefined;
  partnerGender: string | null | undefined;
}): string | null {
  if (profileGenderBucket(params.myGender) === "femme") return params.myUserId;
  if (profileGenderBucket(params.partnerGender) === "femme") return params.partnerUserId;
  return null;
}

function senderSentFreeText(
  chatMessages: ChatMessageForFirstPolicy[],
  senderId: string,
): boolean {
  return chatMessages.some((m) => m.sender_id === senderId && isFreeTextChatMessage(m));
}

/**
 * La conversation texte est-elle ouverte pour les deux ?
 * (Ne tient pas compte des `activity_proposals`.)
 */
export function hasConversationStarted(params: {
  myUserId: string;
  partnerUserId: string;
  chatMessages: ChatMessageForFirstPolicy[];
  matchInitiatorUserId?: string | null;
  myGender: string | null | undefined;
  myIntent: unknown;
  partnerGender: string | null | undefined;
  partnerIntent: unknown;
}): boolean {
  const anyFreeText = params.chatMessages.some((m) => isFreeTextChatMessage(m));
  if (!anyFreeText) return false;

  if (isFriendshipIntentPair(params.myIntent, params.partnerIntent)) {
    return true;
  }

  const mine = parseProfileIntent(params.myIntent);
  const theirs = parseProfileIntent(params.partnerIntent);
  if (mine !== PROFILE_INTENT_AMOUR || theirs !== PROFILE_INTENT_AMOUR) {
    return true;
  }

  if (isStrictFemmeHommePair(params.myGender, params.partnerGender)) {
    const femmeId = femmeUserIdInPair(params);
    if (!femmeId) return true;
    return senderSentFreeText(params.chatMessages, femmeId);
  }

  if (isSameGenderFemmeFemmeOrHommeHommePair(params.myGender, params.partnerGender)) {
    const initiator = params.matchInitiatorUserId?.trim();
    if (!initiator) return true;
    return senderSentFreeText(params.chatMessages, initiator);
  }

  return true;
}

/** @deprecated Alias explicite — préférer `hasConversationStarted`. */
export function computeFreeChatUnlocked(params: {
  myUserId: string;
  partnerUserId: string;
  chatMessages: ChatMessageForFirstPolicy[];
  matchInitiatorUserId?: string | null;
  myGender: string | null | undefined;
  myIntent: unknown;
  partnerGender: string | null | undefined;
  partnerIntent: unknown;
}): boolean {
  return hasConversationStarted(params);
}

/**
 * L’utilisateur peut-il envoyer un message texte libre maintenant ?
 */
export function canUserSendChatTextMessage(params: {
  conversationStarted: boolean;
  myUserId: string;
  matchInitiatorUserId?: string | null;
  myGender: string | null | undefined;
  myIntent: unknown;
  partnerGender: string | null | undefined;
  partnerIntent: unknown;
}): boolean {
  if (params.conversationStarted) return true;

  if (!params.myUserId) return false;

  if (isFriendshipIntentPair(params.myIntent, params.partnerIntent)) {
    return true;
  }

  const mine = parseProfileIntent(params.myIntent);
  const theirs = parseProfileIntent(params.partnerIntent);
  if (mine !== PROFILE_INTENT_AMOUR || theirs !== PROFILE_INTENT_AMOUR) {
    return true;
  }

  if (isStrictFemmeHommePair(params.myGender, params.partnerGender)) {
    return profileGenderBucket(params.myGender) === "femme";
  }

  if (isSameGenderFemmeFemmeOrHommeHommePair(params.myGender, params.partnerGender)) {
    const initiator = params.matchInitiatorUserId?.trim();
    if (!initiator) return true;
    return initiator === params.myUserId;
  }

  return true;
}

/** Bouton / composer d’activité dans le chat (hors garde-fous métier pending / accepté). */
export function canUserSendActivityProposal(params: {
  myUserId: string;
  myIntent: unknown;
  partnerIntent: unknown;
}): boolean {
  if (!params.myUserId) return false;

  if (isFriendshipIntentPair(params.myIntent, params.partnerIntent)) {
    return true;
  }

  const mine = parseProfileIntent(params.myIntent);
  const theirs = parseProfileIntent(params.partnerIntent);
  if (mine !== PROFILE_INTENT_AMOUR || theirs !== PROFILE_INTENT_AMOUR) {
    return true;
  }

  return true;
}

export type FirstMessagePolicyReason =
  | "no_user"
  | "conversation_started"
  | "friendship"
  | "mixed_intent"
  | "hetero_femme_may_start"
  | "hetero_homme_wait"
  | "same_gender_initiator_may_start"
  | "same_gender_wait_initiator"
  | "default_allowed";

export function explainCanSendFreeMessage(params: {
  conversationStarted: boolean;
  myUserId: string;
  matchInitiatorUserId?: string | null;
  myGender: string | null | undefined;
  myIntent: unknown;
  partnerGender: string | null | undefined;
  partnerIntent: unknown;
}): { canSendFreeMessage: boolean; reason: FirstMessagePolicyReason } {
  if (!params.myUserId) {
    return { canSendFreeMessage: false, reason: "no_user" };
  }
  if (params.conversationStarted) {
    return { canSendFreeMessage: true, reason: "conversation_started" };
  }
  if (isFriendshipIntentPair(params.myIntent, params.partnerIntent)) {
    return { canSendFreeMessage: true, reason: "friendship" };
  }

  const mine = parseProfileIntent(params.myIntent);
  const theirs = parseProfileIntent(params.partnerIntent);
  if (mine !== PROFILE_INTENT_AMOUR || theirs !== PROFILE_INTENT_AMOUR) {
    return { canSendFreeMessage: true, reason: "mixed_intent" };
  }

  if (isStrictFemmeHommePair(params.myGender, params.partnerGender)) {
    if (profileGenderBucket(params.myGender) === "femme") {
      return { canSendFreeMessage: true, reason: "hetero_femme_may_start" };
    }
    return { canSendFreeMessage: false, reason: "hetero_homme_wait" };
  }

  if (isSameGenderFemmeFemmeOrHommeHommePair(params.myGender, params.partnerGender)) {
    const initiator = params.matchInitiatorUserId?.trim();
    if (!initiator) {
      return { canSendFreeMessage: true, reason: "default_allowed" };
    }
    if (initiator === params.myUserId) {
      return { canSendFreeMessage: true, reason: "same_gender_initiator_may_start" };
    }
    return { canSendFreeMessage: false, reason: "same_gender_wait_initiator" };
  }

  return { canSendFreeMessage: true, reason: "default_allowed" };
}

export function buildFirstMessagePolicyBlockMessage(params: {
  partnerFirstName?: string | null;
  locale?: "fr" | "en";
}): string {
  const name = params.partnerFirstName?.trim();
  if (params.locale === "en") {
    return name
      ? `${name} needs to start the conversation in this match.`
      : "Your match needs to start the conversation in this match.";
  }
  return name
    ? `Dans ce match, ${name} doit lancer la conversation.`
    : "Dans ce match, votre correspondant·e doit lancer la conversation.";
}
