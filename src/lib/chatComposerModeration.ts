/**
 * Modération composer chat — contact / réseaux + sollicitations commerciales.
 * Filtre UI uniquement : un trigger SQL serveur existe déjà (`enforce_message_body_safety`)
 * mais reste plus grossier ; un contrôle serveur plus riche sera requis avant prod.
 */

import { antiExitValidator } from "./antiExitValidator";

export const CHAT_CONTACT_BLOCK_MESSAGE =
  "Pour votre sécurité, les coordonnées personnelles et les réseaux sociaux ne peuvent pas être partagés à cette étape. Continuez vos échanges sur SPLove.";

export const CHAT_COMMERCE_BLOCK_MESSAGE =
  "Ce message semble contraire aux règles de SPLove. Les sollicitations commerciales, sexuelles ou financières ne sont pas autorisées.";

export type ChatComposerModerationResult =
  | { blocked: false }
  | { blocked: true; kind: "contact" | "commerce"; message: string };

const CONTACT_REASONS = new Set([
  "exit:url",
  "exit:email",
  "exit:phone",
  "exit:handle",
  "exit:social",
  "exit:social_token",
  "exit:tld",
  "exit:bypass",
  "exit:digit_run",
]);

/** Réseaux / motifs supplémentaires (complément antiExit). */
const EXTRA_SOCIAL =
  /\b(?:bereal|be\s*real|twitter|onlyfans|facebook|messenger|whatsapp|telegram|signal|discord|tiktok|snapchat|snap|instagram|insta|ig)\b/i;

const SEXUAL_SERVICE =
  /\b(?:escort(?:\s*girl)?|massage\s*priv(?:é|e)?|prostitution|contenu\s*priv(?:é|e)?|photo\s*payante|onlyfans)\b/i;

const PAYMENT_SIGNAL =
  /\b(?:tarif|cash|virement|paypal|revolut|crypto|bitcoin|btc|paiement)\b/i;

const SALE_SIGNAL = /\b(?:vente|revendre|revente|livraison|commande)\b/i;

const MEETUP_SIGNAL = /\b(?:rendez[-\s]?vous|\brdv\b)\b/i;

const EXTERNAL_LINK =
  /(?:https?:\/\/|www\.|\.(?:com|fr|net)\b|t\.me|discord\.gg|wa\.me)/i;

function normalizeForScan(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[.\-_/\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Détection partage de coordonnées / réseaux (réutilise antiExit hors high_risk commerce). */
export function isChatContactSharingBlocked(text: string): boolean {
  if (!text?.trim()) return false;
  const result = antiExitValidator(text, "message");
  if (result.isBlocked && CONTACT_REASONS.has(result.reason)) return true;
  const n = normalizeForScan(text);
  if (EXTRA_SOCIAL.test(n)) return true;
  if (/(?:@gmail|@hotmail|@icloud|@yahoo)\b/i.test(text)) return true;
  if (/(?:\+33|0033)\b/.test(text.replace(/\s/g, ""))) return true;
  return false;
}

/**
 * Sollicitations commerciales / sexuelles — score par combinaison de signaux.
 * Ne bloque pas un mot ambigu isolé (prix, paiement, terrain, réservation, billet).
 */
export function isChatCommercialSolicitationBlocked(text: string): boolean {
  if (!text?.trim()) return false;
  const n = normalizeForScan(text);
  const sexual = SEXUAL_SERVICE.test(n);
  const payment = PAYMENT_SIGNAL.test(n);
  const sale = SALE_SIGNAL.test(n);
  const meetup = MEETUP_SIGNAL.test(n);
  const cash = /\bcash\b/i.test(n);
  const external = EXTERNAL_LINK.test(text) || EXTERNAL_LINK.test(n);

  // service sexuel + tarif/paiement
  if (sexual && payment) return true;
  // contenu privé + paiement (couvert si sexual inclut contenu priv / photo payante)
  if (/\b(?:contenu\s*priv|photo\s*payante|onlyfans)\b/i.test(n) && payment) return true;
  // rendez-vous + cash
  if (meetup && cash) return true;
  // vente + lien externe
  if (sale && external) return true;
  // demande de paiement + coordonnées (téléphone / @ / url)
  if (payment && (isChatContactSharingBlocked(text) || EXTERNAL_LINK.test(text))) return true;

  return false;
}

/** Point d’entrée unique avant envoi d’un message texte. */
export function moderateChatComposerText(text: string): ChatComposerModerationResult {
  if (!text?.trim()) return { blocked: false };
  if (isChatContactSharingBlocked(text)) {
    return { blocked: true, kind: "contact", message: CHAT_CONTACT_BLOCK_MESSAGE };
  }
  if (isChatCommercialSolicitationBlocked(text)) {
    return { blocked: true, kind: "commerce", message: CHAT_COMMERCE_BLOCK_MESSAGE };
  }
  return { blocked: false };
}
