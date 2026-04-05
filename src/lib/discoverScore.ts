/**
 * Discover : qualité de match + fiabilité (anti-fantôme), sans affichage du score brut.
 *
 * - `computeDiscoverMatchScore` : affinité / profil (sans propositions — voir fiabilité)
 * - `computeReliabilityScore` : réponses, messages, propositions, pénalité inactivité
 */

export type DiscoverScoreProfileInput = {
  created_at?: string | null;
  last_active_at?: string | null;
  /** Dernier message envoyé (migration 046). */
  last_reply_at?: string | null;
  messages_count?: number | null;
  first_name?: string | null;
  birth_date?: string | null;
  profile_completed?: boolean | null;
  sport_feeling?: string | null;
  sport_phrase?: string | null;
  premier_moment?: string | null;
  main_photo_url?: string | null;
  portrait_url?: string | null;
  avatar_url?: string | null;
  fullbody_url?: string | null;
  is_photo_verified?: boolean | null;
  activity_proposals_count?: number | null;
  /** Boost après double retour positif (migration 047) — jamais affiché brut. */
  boost_score?: number | null;
  profile_sports?: unknown[] | null;
};

/** Entiers ≥ 0 pour compteurs API (évite NaN / chaînes / null). */
export function coerceNonNegativeInt(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n));
}

/** ISO tolérant : null si vide ou date invalide. */
export function sanitizeIsoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms) ? t : null;
}

/** Copie défensive pour scoring / tri (ne mute pas l’objet source). */
export function normalizeDiscoverProfileInput(p: DiscoverScoreProfileInput): DiscoverScoreProfileInput {
  return {
    ...p,
    messages_count: coerceNonNegativeInt(p.messages_count),
    activity_proposals_count: coerceNonNegativeInt(p.activity_proposals_count),
    boost_score: coerceNonNegativeInt(p.boost_score),
    last_reply_at: sanitizeIsoDate(p.last_reply_at),
    last_active_at: sanitizeIsoDate(p.last_active_at),
    created_at: sanitizeIsoDate(p.created_at),
  };
}

function hasDisplayPhoto(p: DiscoverScoreProfileInput): boolean {
  for (const u of [p.main_photo_url, p.portrait_url, p.avatar_url, p.fullbody_url]) {
    if (typeof u === "string" && u.trim().length > 0) return true;
  }
  return false;
}

/** 0–35 points — profil prêt à passer au réel. */
export function profileCompletenessPoints(p: DiscoverScoreProfileInput): number {
  let pts = 0;
  if (hasDisplayPhoto(p)) pts += 10;
  if (p.first_name?.trim()) pts += 4;
  if (p.birth_date) pts += 4;
  if (p.profile_completed) pts += 5;
  const nSports = Array.isArray(p.profile_sports) ? p.profile_sports.length : 0;
  if (nSports >= 1) pts += 4;
  if (nSports >= 2) pts += 2;
  if (p.sport_phrase?.trim() || p.premier_moment?.trim() || p.sport_feeling?.trim()) pts += 4;
  if (p.is_photo_verified) pts += 2;
  return Math.min(35, pts);
}

/** 0–30 — activité app récente. */
export function lastActivePoints(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 0;
  const ageMs = Date.now() - ts;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (ageMs <= 3 * hour) return 30;
  if (ageMs <= 24 * hour) return 24;
  if (ageMs <= 3 * day) return 18;
  if (ageMs <= 7 * day) return 10;
  if (ageMs <= 30 * day) return 4;
  return 0;
}

/** 0–10 — comptes très récents légèrement favorisés. */
export function accountNewnessPoints(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  const ts = new Date(createdAt).getTime();
  if (Number.isNaN(ts)) return 0;
  const ageMs = Date.now() - ts;
  const day = 24 * 60 * 60 * 1000;
  if (ageMs <= day) return 10;
  if (ageMs <= 3 * day) return 6;
  if (ageMs <= 7 * day) return 3;
  return 0;
}

/** 0–40 — dernier message récent (signal réponse). */
export function lastReplyRecencyPoints(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 0;
  const ageMs = Date.now() - ts;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (ageMs <= 6 * hour) return 40;
  if (ageMs <= 24 * hour) return 34;
  if (ageMs <= 3 * day) return 26;
  if (ageMs <= 7 * day) return 18;
  if (ageMs <= 14 * day) return 10;
  if (ageMs <= 30 * day) return 4;
  return 0;
}

/** 0–22 — volume de messages (engagement). */
export function messagesVolumePoints(count: number | null | undefined): number {
  const c = typeof count === "number" && Number.isFinite(count) ? Math.max(0, count) : 0;
  return Math.min(22, Math.floor(c * 1.45));
}

/** 0–30 — propositions d’activité (passage au réel). */
export function activityProposalsReliabilityPoints(count: number | null | undefined): number {
  const c = typeof count === "number" && Number.isFinite(count) ? Math.max(0, count) : 0;
  return Math.min(30, c * 6);
}

/** Pénalité si jamais écrit en chat, ou dernière activité message trop ancienne. */
export function ghostingPenaltyPoints(lastReplyAt: string | null | undefined): number {
  if (!lastReplyAt?.trim()) return -8;
  const ts = new Date(lastReplyAt).getTime();
  if (Number.isNaN(ts)) return -8;
  const ageMs = Date.now() - ts;
  const day = 24 * 60 * 60 * 1000;
  if (ageMs <= 7 * day) return 0;
  if (ageMs <= 21 * day) return -10;
  if (ageMs <= 45 * day) return -18;
  return -28;
}

/**
 * Score de fiabilité (tri Discover en priorité). Plus haut = mieux.
 * Ne pas afficher tel quel dans l’UI.
 */
/** 0–35 — léger avantage Discover (tri partiel), sans montrer le nombre. */
export function boostScorePoints(boost: number | null | undefined): number {
  const b = typeof boost === "number" && Number.isFinite(boost) ? Math.max(0, boost) : 0;
  return Math.min(35, b * 5);
}

export function computeReliabilityScore(p: DiscoverScoreProfileInput): number {
  try {
    const n = normalizeDiscoverProfileInput(p);
    const reply = lastReplyRecencyPoints(n.last_reply_at);
    const msgs = messagesVolumePoints(n.messages_count);
    const proposals = activityProposalsReliabilityPoints(n.activity_proposals_count);
    const penalty = ghostingPenaltyPoints(n.last_reply_at);
    const boost = boostScorePoints(n.boost_score);
    const sum = reply + msgs + proposals + penalty + boost;
    return Number.isFinite(sum) ? sum : 0;
  } catch (e) {
    console.error("[discoverScore] computeReliabilityScore failed", e);
    return 0;
  }
}

export type ReliabilityUiInput = Pick<
  DiscoverScoreProfileInput,
  "last_reply_at" | "messages_count" | "activity_proposals_count"
>;

/** Indices discrets (optionnel), max 2 — pas de score affiché. */
export function getReliabilityUiHints(p: ReliabilityUiInput): string[] {
  try {
    const x = normalizeDiscoverProfileInput(p);
    const hints: string[] = [];
    const proposals = coerceNonNegativeInt(x.activity_proposals_count);
    const lastReply = x.last_reply_at;
    const msgCount = coerceNonNegativeInt(x.messages_count);

    if (proposals >= 1) {
      hints.push("Aime passer au réel");
    }

    if (lastReply) {
      const ageMs = Date.now() - new Date(lastReply).getTime();
      if (Number.isFinite(ageMs)) {
        const day = 24 * 60 * 60 * 1000;
        const rapid =
          (ageMs <= 3 * day && msgCount >= 1) || (msgCount >= 3 && ageMs <= 14 * day);
        if (rapid) {
          hints.push("Répond généralement rapidement");
        }
      }
    }

    return hints.slice(0, 2);
  } catch (e) {
    console.error("[discoverScore] getReliabilityUiHints failed", e);
    return [];
  }
}

/**
 * Score global d’affinité (second critère de tri après fiabilité).
 */
export function computeDiscoverMatchScore(
  profile: DiscoverScoreProfileInput,
  commonSportsCount: number
): number {
  try {
    const n = normalizeDiscoverProfileInput(profile);
    const common = Math.max(0, Math.floor(Number.isFinite(commonSportsCount) ? commonSportsCount : 0)) * 100;
    const complete = profileCompletenessPoints(n);
    const active = lastActivePoints(n.last_active_at ?? n.created_at);
    const fresh = accountNewnessPoints(n.created_at);
    const sum = common + complete + active + fresh;
    return Number.isFinite(sum) ? sum : 0;
  } catch (e) {
    console.error("[discoverScore] computeDiscoverMatchScore failed", e);
    return 0;
  }
}

export type DiscoverScoreBreakdown = {
  total: number;
  common: number;
  completeness: number;
  lastActive: number;
  newness: number;
};

export function computeDiscoverMatchScoreBreakdown(
  profile: DiscoverScoreProfileInput,
  commonSportsCount: number
): DiscoverScoreBreakdown {
  try {
    const n = normalizeDiscoverProfileInput(profile);
    const cc = Math.max(0, Math.floor(Number.isFinite(commonSportsCount) ? commonSportsCount : 0));
    const common = cc * 100;
    const completeness = profileCompletenessPoints(n);
    const lastActive = lastActivePoints(n.last_active_at ?? n.created_at);
    const newness = accountNewnessPoints(n.created_at);
    const total = common + completeness + lastActive + newness;
    const safe = Number.isFinite(total) ? total : 0;
    return {
      total: safe,
      common,
      completeness,
      lastActive,
      newness,
    };
  } catch (e) {
    console.error("[discoverScore] computeDiscoverMatchScoreBreakdown failed", e);
    return { total: 0, common: 0, completeness: 0, lastActive: 0, newness: 0 };
  }
}
