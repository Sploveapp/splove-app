/**
 * Blocage « anti-sortie » (messages, bio, profil, onboarding).
 * 1) Normalisation (lowercase, déobfusquation, espaces → mots, leet) puis 2) règles.
 */

export type AntiExitContext = "profile" | "message" | "onboarding";

export type AntiExitResult = {
  isBlocked: boolean;
  reason: string;
};

const R = {
  ok: "ok",
  url: "exit:url",
  email: "exit:email",
  phone: "exit:phone",
  handle: "exit:handle",
  social: "exit:social",
  socialToken: "exit:social_token",
  tld: "exit:tld",
  bypass: "exit:bypass",
  highRisk: "exit:high_risk",
  digits: "exit:digit_run",
} as const;

const DIGIT_TO_LETTER: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "2": "z",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "b",
  "7": "t",
  "8": "b",
  "9": "g",
};

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

/** 2) (at) / (dot) / [at] / espaces vagues autour de @ (sans toucher « look at the ») */
function deobfuscateContact(s: string): string {
  let t = s.toLowerCase();
  t = t.replace(/\(dot\)/g, ".").replace(/\[dot\]/g, ".");
  t = t.replace(/\(at\)/g, "@").replace(/\[at\]/g, "@");
  t = t.replace(/\s*@\s*/g, "@");
  return t;
}

/**
 * 2) + 4) « t e l e g r a m » / « i n s t a » → mots reconstitués.
 * Fusionne toute suite de 2+ caractères alphanum isolés (1 caractère par « mot »).
 */
function collapseSpacedSingleLetterRuns(s: string): string {
  const words = s.split(/\s+/).filter((w) => w.length > 0);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    const w0 = words[i]!;
    if (w0.length === 1 && /[a-z0-9]/i.test(w0)) {
      const run: string[] = [];
      let j = i;
      while (j < words.length) {
        const w = words[j]!;
        if (w.length === 1 && /[a-z0-9]/i.test(w)) {
          run.push(w);
          j++;
        } else {
          break;
        }
      }
      if (run.length >= 2) {
        out.push(run.join(""));
        i = j;
      } else {
        out.push(w0);
        i++;
      }
    } else {
      out.push(w0);
      i++;
    }
  }
  return out.join(" ");
}

/** 1) + 2) + 3) : garde alphanum + mappage chiffre → lettre sur la chaîne compacte */
function buildLeetCompact(s: string): string {
  const alnum = s.replace(/[^a-z0-9]/gi, "");
  return alnum.replace(/\d/g, (d) => DIGIT_TO_LETTER[d] ?? d);
}

/**
 * Chaîne normalisée (debug / exports historiques) : lowercase, déobf, collapse, leet, compact.
 */
export function normalizeTextForExitScan(raw: string): string {
  if (raw == null || typeof raw !== "string" || !raw.trim()) return "";
  const a = deobfuscateContact(stripDiacritics(raw.trim()));
  const b = collapseSpacedSingleLetterRuns(a);
  return buildLeetCompact(b);
}

const FORBIDDEN_COMPACT: readonly string[] = [
  "snapchat",
  "instagram",
  "whatsapp",
  "telegram",
  "tiktok",
  "discord",
  "messenger",
  "onlyfans",
  "onlifans",
  "onlfans",
  "onlyfan",
  "facebook",
  "fcbk",
  "fansly",
  "signalapp",
  "watsapp",
  "wathsapp",
  "snapchatt",
  "chatsapp",
  "linktree",
  "allmylink",
  "threads",
].sort((a, b) => b.length - a.length);

const FORBIDDEN_OBFUSCATED: readonly string[] = [
  "snapchat",
  "instagram",
  "whatsapp",
  "telegram",
  "tiktok",
  "discord",
  "onlyfans",
  "onlifans",
  "signal",
  "facebook",
  "messenger",
  "fcbk",
  "prostitution",
  "escorting",
].sort((a, b) => b.length - a.length);

const URL_LIKE =
  /https?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+|\b[a-z0-9][-a-z0-9]*\.(?:com|fr|net|io|app|org|me|gg|ly|link|to|be|de|uk|info|ai)(?:\b|\/|#|\?)/i;
const LINK_HOSTS =
  /wa\.me|t\.me|discord\.(?:gg|com|app)|telegram\.me|tiktok\.com|instagram\.com|(?:m\.)?facebook\.com|fb\.me|threads\.net|snapchat\.com|onlyfans\.com|linktr\.ee|beacons\.ai|allmylinks/i;
const TLD = /\.(?:com|fr|net|io|app|org|me|gg|ly|link|to|be|de|uk|info|ai)(?:\b|\/|#|\?)/i;
const BARE_WWW = /\bwww\./i;
const BARE_HTTP = /\bhttps?\b/i;
const SPL_URL = /splove/i;
const EMAIL_R =
  /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]{2,}\.[A-Za-z]{2,}/i;
const AT_HANDLE = /@[a-z0-9_]{2,30}/i;

const PHONE_PATTERNS: RegExp[] = [
  /(?:\+33|0)\s*[1-9](?:[\s.\-]?\d{2}){4}/,
  /\+\d{1,3}[\s.\-]?\d[\d\s.\-]{7,15}\d/,
  /\b0[1-9](?:[\s.\-]?\d{2}){4}\b/,
];

const OBFUSCATED_SNAP = /s(?:[@._\-\s]|\/)+n(?:[@._\-\s]|\/)+a(?:[@._\-\s]|\/)+p/i;
const HIGH_RISK =
  /\b(?:escort|escorting|prostitution|prostituée|sugar\s*daddy|sugar\s*baby|tarif\s*(?:horaire|rdv)|rdv\s*payant|pay(?:er|e)\s*(?:pour|en)?\s*(?:sexe|service)|massage\s*(?:\+|et)\s*(?:fin|heureux)|meet\s*up\s*(?:paid|payant)|cash(?:\s*meet)?|wire\s*transfer|western\s*union|money\s*gram|virement|paypal|lydia|paysafecard|revolut\s*(?:pour|send)|(?:send|envoy(?:e|er))\s*(?:money|l['’]?argent)|(?:btc|bitcoin|eth|usdt|crypto)\s*(?:wallet|address)?)\b/i;
const DIGIT_RUN_6 = /\d{6,}/;

const SHORT_TOK_RISK = new Set(
  "insta ig igs snap fcbk wspp wapp whats teleg telegrm".split(" "),
);

const BYPASS_RE: RegExp[] = [
  /\binsta\s+(?:moi|dm)\b/i,
  /\bsnap\s+moi\b/i,
  /\bajoute[- ]?moi\b/i,
  /\bmon insta\b/i,
  /\bmon snap\b/i,
  /\bviens sur whatsapp\b/i,
  /viens?\s+en\s+(?:mp|dm|message(?:s)?\s+privé)\b/i,
  /\b(?:mp|dm)\s+moi\b/i,
  /\b(?:écris|ecris|écrivez)[- ]?moi\s+(?:en\s+)?(?:mp|dm)\b/i,
  /\b(?:add|ajoute)[- ]?moi\s+(?:sur|on)\b/i,
  /\b(?:mon|ma)\s+(?:pseudo|profil)\s+(?:snap|insta|tiktok|tel)\b/i,
];

function allowedEcrisSur(t: string): boolean {
  if (!/écris|ecris/i.test(t) || !/moi sur/i.test(t)) return false;
  return /\b(?:écris|ecris)[- ]?moi sur\s+(?:SPLove|l['\u2019]?\s*appli|le chat)\b/i.test(t);
}
function allowedContacteSur(t: string): boolean {
  if (!/contacte[- ]?moi sur/i.test(t)) return false;
  return /\bcontacte[- ]?moi sur\s+(?:SPLove|l['\u2019]?\s*appli|le chat)\b/i.test(t);
}

function byPass(t: string): boolean {
  for (const re of BYPASS_RE) {
    if (re.test(t)) return true;
  }
  if (/\bécris[- ]?moi sur\b/i.test(t) && !allowedEcrisSur(t)) return true;
  if (/\bcontacte[- ]?moi sur\b/i.test(t) && !allowedContacteSur(t)) return true;
  return false;
}

function obfuscatedLong(lower: string): boolean {
  return FORBIDDEN_OBFUSCATED.some((word) => {
    const p = word
      .split("")
      .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^a-z0-9àâäéèêëïîôùûüçñ]+");
    return new RegExp(p, "i").test(lower);
  });
}

function hasForbiddenLongCompact(comp: string): boolean {
  return FORBIDDEN_COMPACT.some((w) => comp.includes(w));
}

function tokenize(deobfCollapsed: string): string[] {
  return deobfCollapsed
    .split(/[^a-z0-9]+/i)
    .map((t) => t.toLowerCase())
    .filter(Boolean);
}

function isLikelyFrOrIntlPhone(s: string): boolean {
  if (PHONE_PATTERNS.some((p) => p.test(s))) return true;
  const d = s.replace(/\D/g, "");
  if (d.length < 8) return false;
  if (/^0[1-9]\d{8}$/.test(d) && d.length === 10) return true;
  if (/^33[1-9]\d{8}$/.test(d) && d.length === 11) return true;
  if (/^1\d{10}$/.test(d) && d.length === 11) return true;
  return false;
}

function longDigitRunWithoutPhone(s: string): boolean {
  if (DIGIT_RUN_6.test(s) && isLikelyFrOrIntlPhone(s)) return false;
  if (!DIGIT_RUN_6.test(s)) return false;
  if (isLikelyFrOrIntlPhone(s)) return false;
  if (/\b(?:19|20)\d{2}\b/.test(s) && s.replace(/\D/g, "").length === 4) return false;
  return true;
}

/**
 * Cœur de détection après préparation des vues.
 */
function detectAll(
  raw: string,
  tDeobf: string,
  _collapsed: string,
  compact: string,
  tokens: string[],
): { isBlocked: true; reason: string } | { isBlocked: false; reason: string } {
  if (HIGH_RISK.test(raw)) return { isBlocked: true, reason: R.highRisk };
  if (byPass(raw)) return { isBlocked: true, reason: R.bypass };

  if (AT_HANDLE.test(raw) || AT_HANDLE.test(tDeobf)) return { isBlocked: true, reason: R.handle };

  if (isLikelyFrOrIntlPhone(raw) || (tDeobf !== raw && isLikelyFrOrIntlPhone(tDeobf)))
    return { isBlocked: true, reason: R.phone };

  if (URL_LIKE.test(raw) || (tDeobf !== raw && URL_LIKE.test(tDeobf)) || LINK_HOSTS.test(tDeobf)) {
    return { isBlocked: true, reason: R.url };
  }
  if ((BARE_WWW.test(tDeobf) || BARE_HTTP.test(tDeobf)) && !SPL_URL.test(tDeobf) && !/splove\./i.test(tDeobf)) {
    return { isBlocked: true, reason: R.url };
  }
  if (EMAIL_R.test(raw) || EMAIL_R.test(tDeobf)) return { isBlocked: true, reason: R.email };
  if (TLD.test(tDeobf) && !/splove\./i.test(tDeobf)) return { isBlocked: true, reason: R.tld };
  if (OBFUSCATED_SNAP.test(tDeobf) || OBFUSCATED_SNAP.test(raw)) return { isBlocked: true, reason: R.social };
  if (obfuscatedLong(tDeobf) || obfuscatedLong(raw)) return { isBlocked: true, reason: R.social };

  for (const tok of tokens) {
    if (SHORT_TOK_RISK.has(tok)) return { isBlocked: true, reason: R.socialToken };
  }
  if (hasForbiddenLongCompact(compact)) return { isBlocked: true, reason: R.social };
  if (longDigitRunWithoutPhone(raw)) return { isBlocked: true, reason: R.digits };

  return { isBlocked: false, reason: R.ok };
}

/**
 * @deprecated Préférer `antiExitValidator(...).isBlocked`.
 */
export function textViolatesAntiExitRules(text: string): boolean {
  return antiExitValidator(text).isBlocked;
}

export { SAFETY_CONTENT_REFUSAL as ANTI_EXIT_USER_MESSAGE } from "../constants/copy";

/**
 * 1) lowercase via déobf, 2) spéciaux gérés dans tokens, 3) leet sur compact, 4) espaces repliés.
 */
export function antiExitValidator(text: string, _context?: AntiExitContext): AntiExitResult {
  if (text == null || typeof text !== "string" || !String(text).trim()) {
    return { isBlocked: false, reason: R.ok };
  }
  const raw = text;
  const t0 = raw.trim();
  const deobf = deobfuscateContact(stripDiacritics(t0));
  const collapsed = collapseSpacedSingleLetterRuns(deobf);
  const tokens = tokenize(collapsed);
  const compact = buildLeetCompact(collapsed);
  const res = detectAll(raw, deobf, collapsed, compact, tokens);
  if (res.isBlocked) return { isBlocked: true, reason: res.reason };
  return { isBlocked: false, reason: R.ok };
}
