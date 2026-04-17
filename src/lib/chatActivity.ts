/**
 * Messages d’activité SPLove (MVP) : prefix + JSON pour détecter les propositions
 * côté client sans migration DB. Le corps affiché côté UI reste `message`.
 */
export const ACTIVITY_MARKER = "[splove-activity]";
export const ACTIVITY_REPLY_MARKER = "[splove-activity-reply]";

/** Créneaux MVP — alignés sur le modal de proposition */
export type ActivityWhen =
  | "tonight"
  | "tomorrow"
  | "week"
  | "weekend"
  | "other";

export type ActivityPayload = {
  sport: string;
  when: ActivityWhen;
  place: string;
  message: string;
  scheduledAt?: string;
};

/** Côté chat après le match (écran « nouveau match » = page `Match`). */
export type ActivityProductState = "awaiting_activity" | "activity_proposed";
export type ActivityReplyChoice = "go" | "other_slot" | "not_available";

export function formatActivityMessage(p: ActivityPayload): string {
  return `${ACTIVITY_MARKER}\n${JSON.stringify(p)}`;
}

export function formatActivityReply(choice: ActivityReplyChoice): string {
  return `${ACTIVITY_REPLY_MARKER}\n${choice}`;
}

export function tryParseActivityMessage(body: string): ActivityPayload | null {
  const t = body.trimStart();
  if (!t.startsWith(ACTIVITY_MARKER)) return null;
  const jsonPart = t.slice(ACTIVITY_MARKER.length).trim();
  try {
    const j = JSON.parse(jsonPart) as Partial<ActivityPayload>;
    if (typeof j.sport !== "string" || typeof j.message !== "string") return null;
    const when: ActivityWhen =
      j.when === "tonight" ||
      j.when === "tomorrow" ||
      j.when === "week" ||
      j.when === "weekend" ||
      j.when === "other"
        ? j.when
        : "other";
    return {
      sport: j.sport,
      when,
      place: typeof j.place === "string" ? j.place : "",
      message: j.message,
    };
  } catch {
    return null;
  }
}

export function tryParseActivityReply(body: string): ActivityReplyChoice | null {
  const t = body.trimStart();
  if (!t.startsWith(ACTIVITY_REPLY_MARKER)) return null;
  const choice = t.slice(ACTIVITY_REPLY_MARKER.length).trim();
  if (choice === "go" || choice === "other_slot" || choice === "not_available") return choice;
  return null;
}

export function whenLabelFr(w: ActivityWhen): string {
  switch (w) {
    case "tonight":
      return "ce soir";
    case "tomorrow":
      return "demain";
    case "week":
      return "cette semaine";
    case "weekend":
      return "ce week-end";
    default:
      return "bientôt";
  }
}

export function computeProposalSchedule(when: ActivityWhen): {
  scheduledAt: string;
  timeLabel: string;
} {
  const now = new Date();

  const atHour = (d: Date, h: number, min: number) => {
    const x = new Date(d);
    x.setHours(h, min, 0, 0);
    return x;
  };

  switch (when) {
    case "tonight": {
      let slot = atHour(now, 20, 0);
      if (slot.getTime() <= now.getTime()) {
        slot = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      }
      return { scheduledAt: slot.toISOString(), timeLabel: "Ce soir" };
    }
    case "tomorrow": {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      const slot = atHour(t, 18, 30);
      return { scheduledAt: slot.toISOString(), timeLabel: "Demain" };
    }
    case "week": {
      const t = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      return { scheduledAt: atHour(t, 19, 0).toISOString(), timeLabel: "Cette semaine" };
    }
    case "weekend": {
      const t = new Date(now);
      const day = t.getDay();
      const daysUntilSat = (6 - day + 7) % 7 || 7;
      t.setDate(t.getDate() + daysUntilSat);
      return { scheduledAt: atHour(t, 10, 0).toISOString(), timeLabel: "Ce week-end" };
    }
    default: {
      const t = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
      return { scheduledAt: atHour(t, 18, 0).toISOString(), timeLabel: "Créneau à préciser" };
    }
  }
}

export function buildDefaultActivityMessage(sport: string, when: ActivityWhen): string {
  const s = sport.trim() || "sortie ensemble";
  if (when === "tonight") return `Ça te dirait un ${s} ce soir ?`;
  if (when === "tomorrow") return `Ça te dirait un ${s} demain ?`;
  if (when === "weekend") return `Ça te dirait un ${s} ce week-end ?`;
  if (when === "week") return `Ça te dirait un ${s} cette semaine ?`;
  return `On pourrait se faire un ${s} bientôt, ça te tente ?`;
}

/** Version d’affichage stockée dans `note` — pour future carte riche dans le fil. */
export const ACTIVITY_PROPOSAL_NOTE_FORMAT_VERSION = 1 as const;

/**
 * Emoji discret selon le libellé sport (heuristique FR/EN).
 */
export function sportEmojiHint(sport: string): string {
  const s = sport.toLowerCase();
  if (s.includes("rando") || s.includes("trail") || s.includes("hik")) return "🥾";
  if (s.includes("run") || s.includes("course") || s.includes("jogg")) return "🏃";
  if (s.includes("vélo") || s.includes("velo") || s.includes("cycl") || s.includes("vtt")) return "🚴";
  if (s.includes("natation") || s.includes("swim") || s.includes("piscine")) return "🏊";
  if (s.includes("tennis") || s.includes("padel")) return "🎾";
  if (s.includes("muscu") || s.includes("fitness") || s.includes("musculation") || s.includes("crossfit"))
    return "🏋️";
  if (s.includes("yoga") || s.includes("pilates")) return "🧘";
  if (s.includes("foot") || s.includes("futsal")) return "⚽";
  if (s.includes("basket")) return "🏀";
  if (s.includes("surf") || s.includes("skate")) return "🏄";
  if (s.includes("ski") || s.includes("snow")) return "⛷️";
  return "🎯";
}

/**
 * Texte unique pour `activity_proposals.note` : ligne structurée + ligne(s) utilisateur en dessous.
 * Les champs sport / créneau / lieu restent aussi en colonnes SQL pour une future carte.
 */
export function formatActivityProposalNote(input: {
  sport: string;
  when: ActivityWhen;
  place: string;
  /** Court message (puce ou perso) — peut être vide. */
  userLine?: string;
}): string {
  const sport = input.sport.trim() || "Activité";
  const emoji = sportEmojiHint(sport);
  const when = whenLabelFr(input.when);
  const place = input.place.trim();
  const head = place
    ? `Proposition d'activité : ${emoji} ${sport} — ${when} — ${place}`
    : `Proposition d'activité : ${emoji} ${sport} — ${when}`;
  const u = (input.userLine ?? "").trim();
  if (!u) return head;
  return `${head}\n\n${u}`;
}

const matchOpenedKey = (conversationId: string) => `splove_match_open_${conversationId}`;

/** À appeler à l’ouverture du match ou du chat : ancre le début des 48h / 24h (MVP UI). */
export function touchMatchOpenedAt(conversationId: string): void {
  const k = matchOpenedKey(conversationId);
  if (!sessionStorage.getItem(k)) {
    sessionStorage.setItem(k, String(Date.now()));
  }
}

export function getMatchOpenedAt(conversationId: string): number | null {
  const v = sessionStorage.getItem(matchOpenedKey(conversationId));
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export const COPY_BANNER_48H =
  "Les premiers pas se font naturellement — pensez à proposer un moment dans les deux jours qui suivent le match.";

/** Indication douce du temps restant (éviter le ton « compte à rebours stressant »). */
export function formatMatchWindowRemaining(ms: number): string {
  if (ms <= 0) return "La fenêtre privilégiée est passée";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h >= 24) return "Encore environ un jour pour proposer un créneau";
  if (h > 0) return m > 0 ? `Encore environ ${h} h ${m} min` : `Encore environ ${h} h`;
  if (m > 0) return `Encore environ ${m} min`;
  return "Tout juste le temps de proposer un créneau";
}

export const COPY_MATCH_DORMANT =
  "Ce match se fait discret… Vous pouvez encore relancer la conversation quand vous voulez.";
export const COPY_BANNER_PROPOSED = "Une activité est déjà proposée. Faites avancer le réel.";
export const COPY_NUDGE_24H = "Ici, on se découvre en bougeant.";

/** Réponses guidées (envoyées comme messages classiques). */
export const GUIDED_REPLY_YES = "J’y vais";
export const GUIDED_REPLY_OTHER_TIME = "Proposer un autre créneau";
export const GUIDED_REPLY_NOT_AVAILABLE = "Pas dispo";

export function deriveActivityFlags(
  messages: { sender_id: string; body: string }[],
  myUserId: string | undefined
): { hasProposal: boolean; iProposed: boolean; theyProposed: boolean } {
  let iProposed = false;
  let theyProposed = false;
  for (const m of messages) {
    if (!tryParseActivityMessage(m.body)) continue;
    if (myUserId && m.sender_id === myUserId) iProposed = true;
    else theyProposed = true;
  }
  return {
    hasProposal: iProposed || theyProposed,
    iProposed,
    theyProposed,
  };
}

export function getProductState(flags: {
  hasProposal: boolean;
}): ActivityProductState {
  if (flags.hasProposal) return "activity_proposed";
  return "awaiting_activity";
}
