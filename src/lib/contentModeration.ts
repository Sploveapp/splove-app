/**
 * Modération des textes saisis par les utilisateurs (messages, phrase sport onboarding).
 * Aligné produit : garder les échanges sur SPLove jusqu’à la rencontre réelle.
 */

import { SAFETY_CONTENT_REFUSAL } from "../constants/copy";

export { SAFETY_CONTENT_REFUSAL as CHAT_MESSAGE_POLICY_BLOCKED_MESSAGE };

export type ModerationContext = "chat" | "bio";

/**
 * Mots longs : sous-chaîne après normalisation (ex. « i.n.s.t.a.g.r.a.m »).
 */
const FORBIDDEN_SUBSTRINGS_NORMALIZED: readonly string[] = [
  "snapchat",
  "instagram",
  "whatsapp",
  "telegram",
  "tiktok",
  "discord",
  "messenger",
  "onlyfans",
  "fansly",
  "signalapp",
].sort((a, b) => b.length - a.length);

/** Mots courts : mots entiers uniquement (évite « instant », « snapshot », « discordance »). */
const SHORT_FORBIDDEN_WORD = /\b(?:snap|insta|discord|tiktok|telegram|whatsapp|venmo|zelle)\b/i;

const FORBIDDEN_OBFUSCATED_LONG: readonly string[] = [
  "snapchat",
  "instagram",
  "whatsapp",
  "telegram",
  "tiktok",
  "discord",
  "onlyfans",
  "signal",
  "prostitution",
  "escorting",
].sort((a, b) => b.length - a.length);

const OBFUSCATED_SNAP_WITH_SEPARATORS =
  /s(?:[@._\-\s]|\/)+n(?:[@._\-\s]|\/)+a(?:[@._\-\s]|\/)+p/i;

/** Argent, escort, contournement évidents (FR + EN). */
const HIGH_RISK_PHRASES =
  /\b(?:escort|escorting|prostitution|prostituée|sugar\s*daddy|sugar\s*baby|tarif\s*(?:horaire|rdv)|rdv\s*payant|pay(?:er|e)\s*(?:pour|en)?\s*(?:sexe|service)|massage\s*(?:\+|et)\s*(?:fin|heureux)|meet\s*up\s*(?:paid|payant)|cash(?:\s*meet)?|wire\s*transfer|western\s*union|money\s*gram|virement|paypal|lydia|paysafecard|revolut\s*(?:pour|send)|(?:send|envoy(?:e|er))\s*(?:money|l['’]?argent)|(?:btc|bitcoin|eth|usdt|crypto)\s*(?:wallet|address)?)\b/i;

export function normalizeMessageForPolicyScan(raw: string): string {
  return raw.toLowerCase().replace(/[@._\-\s]/g, "");
}

function forbiddenSubstringInNormalized(normalized: string): boolean {
  return FORBIDDEN_SUBSTRINGS_NORMALIZED.some((w) => normalized.includes(w));
}

function forbiddenWordObfuscatedLong(lower: string): boolean {
  return FORBIDDEN_OBFUSCATED_LONG.some((word) => {
    const pattern = word
      .split("")
      .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^a-z0-9àâäéèêëïîôùûüçñ]+");
    return new RegExp(pattern, "i").test(lower);
  });
}

/** @ pseudo réseau / contact (lettres/chiffres après @). */
const HANDLE_AFTER_AT = /@[a-zA-Z0-9_]{2,30}\b/;

const DIGIT_RUN_6 = /\d{6,}/;

const LINK_HTTP = /https?:\/\//i;
const LINK_WWW = /\bwww\./i;
/** Domaines et raccourcis courants */
const TLD_COMMON =
  /\.(?:com|fr|io|net|org|me|gg|ly|co|app|link|bio|to|eu|info|xyz|ai|cc|be|de|uk)\b/i;

const SHORT_LINK_HOSTS =
  /\bwa\.me\b|\bt\.me\b|discord\.(?:gg|com|app)|telegram\.me|tiktok\.com|instagram\.com|(?:m\.)?facebook\.com|fb\.me|threads\.net|snapchat\.com|onlyfans\.com|linktr\.ee|beacons\.ai|solo\.to|taplink|allmylinks/i;

const PHONE_PATTERNS = [
  /(?:\+33|0)\s*[1-9](?:[\s.\-]?\d{2}){4}/,
  /\+\d{1,3}[\s.\-]?\d[\d\s.\-]{8,}\d/,
  /\b0\d(?:[\s.\-]?\d{2}){4}\b/,
];

const BYPASS_CONTACT_HINTS = [
  /\binsta\s+(?:moi|dm)\b/i,
  /\bsnap\s+moi\b/i,
  /\bviens?\s+en\s+(?:mp|dm|message(?:s)?\s+privé)\b/i,
  /\b(?:mp|dm)\s+moi\b/i,
  /\b(?:écris|envoie)[- ]?moi\s+(?:en\s+)?(?:mp|dm)\b/i,
  /\b(?:add|ajoute)[- ]?moi\s+(?:sur|on)\b/i,
  /\b(?:mon|ma)\s+(?:pseudo|profil)\s+(?:snap|insta|tiktok|tel)\b/i,
];

function coreTextViolatesPolicy(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;

  const lower = t.toLowerCase();
  const normalized = normalizeMessageForPolicyScan(t);

  if (HIGH_RISK_PHRASES.test(t)) return true;

  if (forbiddenSubstringInNormalized(normalized)) return true;
  if (SHORT_FORBIDDEN_WORD.test(lower)) return true;
  if (OBFUSCATED_SNAP_WITH_SEPARATORS.test(lower)) return true;
  if (forbiddenWordObfuscatedLong(lower)) return true;

  if (LINK_HTTP.test(t) || LINK_WWW.test(t)) return true;
  if (TLD_COMMON.test(lower)) return true;
  if (SHORT_LINK_HOSTS.test(lower)) return true;

  if (DIGIT_RUN_6.test(t)) return true;
  if (PHONE_PATTERNS.some((re) => re.test(t))) return true;

  if (HANDLE_AFTER_AT.test(t)) return true;

  for (const re of BYPASS_CONTACT_HINTS) {
    if (re.test(t)) return true;
  }

  return false;
}

/**
 * Texte « bio » (phrase sport, etc.) : même cœur + interdiction des # (hashtags / tags réseau).
 */
export function userGeneratedContentViolatesPolicy(
  raw: string,
  context: ModerationContext,
): boolean {
  if (coreTextViolatesPolicy(raw)) return true;
  if (context === "bio" && /#/.test(raw)) return true;
  return false;
}

/** Messages chat & notes d’activité (pas de # obligatoire sauf si capté par core). */
export function messageContainsDisallowedContent(raw: string): boolean {
  return userGeneratedContentViolatesPolicy(raw, "chat");
}

/** Phrase sport / champs profil type « bio » courte. */
export function bioPublicTextViolatesPolicy(raw: string): boolean {
  return userGeneratedContentViolatesPolicy(raw, "bio");
}
