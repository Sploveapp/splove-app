/**
 * Règles produit — premier message texte dans le chat post-match :
 * - Intention **Amical** (les deux) : les deux peuvent écrire.
 * - Intention **Amoureux** + couple **Femme / Homme** (strict) : seule la personne **Femme** envoie le premier message texte.
 * - Intention **Amoureux** + autres couples (homo, etc.) : les deux peuvent écrire.
 * - Dès qu’au moins un message texte existe, les deux peuvent continuer.
 *
 * Les **propositions d’activité** ne passent pas par cette règle (voir Chat `sendActivity`).
 */

import {
  parseProfileIntent,
  PROFILE_INTENT_AMOUR,
  isFriendshipIntentPair,
} from "./profileIntent";

function isFemmeLabel(g: string | null | undefined): boolean {
  return (g ?? "").trim().toLowerCase() === "femme";
}

function isHommeLabel(g: string | null | undefined): boolean {
  return (g ?? "").trim().toLowerCase() === "homme";
}

/** Couple hétéro classique (labels onboarding Femme / Homme uniquement). */
export function isStrictFemmeHommePair(
  genderA: string | null | undefined,
  genderB: string | null | undefined
): boolean {
  return (
    (isFemmeLabel(genderA) && isHommeLabel(genderB)) ||
    (isFemmeLabel(genderB) && isHommeLabel(genderA))
  );
}

/**
 * L’utilisateur peut-il envoyer un **message texte** maintenant ?
 * (Si `messageCount === 0`, applique la règle du premier message.)
 */
export function canUserSendChatTextMessage(params: {
  messageCount: number;
  myGender: string | null | undefined;
  myIntent: unknown;
  partnerGender: string | null | undefined;
  partnerIntent: unknown;
}): boolean {
  if (params.messageCount > 0) return true;

  if (isFriendshipIntentPair(params.myIntent, params.partnerIntent)) {
    return true;
  }

  const mine = parseProfileIntent(params.myIntent);
  const theirs = parseProfileIntent(params.partnerIntent);
  if (mine !== PROFILE_INTENT_AMOUR || theirs !== PROFILE_INTENT_AMOUR) {
    return true;
  }

  if (!isStrictFemmeHommePair(params.myGender, params.partnerGender)) {
    return true;
  }

  return isFemmeLabel(params.myGender);
}
