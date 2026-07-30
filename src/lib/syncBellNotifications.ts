import { CHAT_MESSAGES_TABLE, supabase } from "./supabase";
import { isPremiumSplovePlay, resolveSplovePlayType } from "./splovePlay";

type ActorInfo = { name: string; avatar: string };

let lastSyncAt = 0;
let syncInFlight: Promise<void> | null = null;
const SYNC_THROTTLE_MS = 20_000;

async function fetchExistingDedupeKeys(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("in_app_notifications")
    .select("dedupe_key")
    .eq("user_id", userId)
    .not("dedupe_key", "is", null);
  if (error) {
    console.warn("[bellSync] existing dedupe keys", error.message);
    return new Set();
  }
  return new Set(
    (data ?? [])
      .map((row) => (typeof row.dedupe_key === "string" ? row.dedupe_key : ""))
      .filter(Boolean),
  );
}

async function upsertBellNotification(params: {
  userId: string;
  kind: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  eventAt?: string | null;
  existingKeys?: Set<string>;
}): Promise<void> {
  if (params.existingKeys?.has(params.dedupeKey)) {
    return;
  }

  const payload = {
    ...params.payload,
    ...(params.eventAt ? { event_at: params.eventAt } : {}),
  };

  const { error } = await supabase.rpc("splove_upsert_notification", {
    p_user_id: params.userId,
    p_kind: params.kind,
    p_dedupe_key: params.dedupeKey,
    p_payload: payload,
    p_exempt_daily_cap: true,
    p_event_at: params.eventAt ?? null,
  });
  if (error) {
    console.warn("[bellSync] upsert", params.kind, error.message);
    return;
  }
  params.existingKeys?.add(params.dedupeKey);
}

async function fetchActorMap(ids: string[]): Promise<Map<string, ActorInfo>> {
  const out = new Map<string, ActorInfo>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, main_photo_url, portrait_url, avatar_url")
    .in("id", unique);
  if (error) {
    console.warn("[bellSync] profiles", error.message);
    return out;
  }

  for (const row of data ?? []) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    const name =
      typeof row.first_name === "string" && row.first_name.trim()
        ? row.first_name.trim()
        : "Quelqu'un";
    const avatar =
      (typeof row.main_photo_url === "string" && row.main_photo_url.trim()) ||
      (typeof row.portrait_url === "string" && row.portrait_url.trim()) ||
      (typeof row.avatar_url === "string" && row.avatar_url.trim()) ||
      "";
    out.set(id, { name, avatar });
  }
  return out;
}

function actorPayload(actorId: string, actors: Map<string, ActorInfo>): Record<string, unknown> {
  const a = actors.get(actorId);
  return {
    actor_id: actorId,
    actor_name: a?.name ?? "Quelqu'un",
    actor_avatar: a?.avatar ?? "",
  };
}

function likesYouRoute(actorId: string): string {
  return `/likes-you?liker=${encodeURIComponent(actorId)}`;
}

/**
 * Reconstruit les notifications cloche manquantes à partir des événements sociaux (RLS).
 * Idempotent : ne réécrit pas les lignes déjà présentes (dedupe_key).
 */
export async function syncBellNotificationsFromSocialEvents(): Promise<void> {
  const now = Date.now();
  if (syncInFlight) return syncInFlight;
  if (now - lastSyncAt < SYNC_THROTTLE_MS) return;

  syncInFlight = (async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return;
    const me = user.id;

    try {
      const existingKeys = await fetchExistingDedupeKeys(me);
      await syncIncomingLikesAndPlay(me, existingKeys);
      await syncMatches(me, existingKeys);
      await syncActivityProposals(me, existingKeys);
      await syncFirstMessages(me, existingKeys);
    } catch (e) {
      console.warn("[bellSync] failed", e instanceof Error ? e.message : e);
    } finally {
      lastSyncAt = Date.now();
    }
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

async function syncIncomingLikesAndPlay(me: string, existingKeys: Set<string>): Promise<void> {
  const { data: likes, error } = await supabase
    .from("likes")
    .select("id, liker_id, liked_id, play_type, created_at")
    .eq("liked_id", me)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error || !likes?.length) {
    if (error) console.warn("[bellSync] likes", error.message);
    return;
  }

  const likerIds = likes
    .map((l) => (typeof l.liker_id === "string" ? l.liker_id : ""))
    .filter(Boolean);

  const [{ data: outbound }, actors] = await Promise.all([
    supabase.from("likes").select("liked_id").eq("liker_id", me).in("liked_id", likerIds),
    fetchActorMap(likerIds),
  ]);

  const reciprocal = new Set(
    (outbound ?? [])
      .map((r) => (typeof r.liked_id === "string" ? r.liked_id : ""))
      .filter(Boolean),
  );

  for (const like of likes) {
    const from = typeof like.liker_id === "string" ? like.liker_id : "";
    const likeId = typeof like.id === "string" ? like.id : "";
    const eventAt = typeof like.created_at === "string" ? like.created_at : null;
    if (!from || !likeId || from === me) continue;
    if (reciprocal.has(from)) continue;

    const play = resolveSplovePlayType(like.play_type);
    const base = {
      ...actorPayload(from, actors),
      route: likesYouRoute(from),
    };

    if (isPremiumSplovePlay(play)) {
      await upsertBellNotification({
        userId: me,
        kind: "play_sent",
        dedupeKey: `play_sent:${from}:${play}`,
        payload: { ...base, play_type: play },
        eventAt,
        existingKeys,
      });
    } else {
      await upsertBellNotification({
        userId: me,
        kind: "new_like",
        dedupeKey: `new_like:${from}:${likeId}`,
        payload: base,
        eventAt,
        existingKeys,
      });
    }
  }
}

async function syncMatches(me: string, existingKeys: Set<string>): Promise<void> {
  const { data: matches, error } = await supabase
    .from("matches")
    .select("id, user_a, user_b, created_at")
    .or(`user_a.eq.${me},user_b.eq.${me}`)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error || !matches?.length) {
    if (error) console.warn("[bellSync] matches", error.message);
    return;
  }

  const matchIds = matches.map((m) => m.id).filter(Boolean) as string[];
  const peerIds = matches
    .map((m) => (m.user_a === me ? m.user_b : m.user_a))
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const [{ data: convs }, actors] = await Promise.all([
    supabase.from("conversations").select("id, match_id").in("match_id", matchIds),
    fetchActorMap(peerIds),
  ]);

  const convByMatch = new Map<string, string>();
  for (const c of convs ?? []) {
    if (typeof c.match_id === "string" && typeof c.id === "string") {
      convByMatch.set(c.match_id, c.id);
    }
  }

  for (const m of matches) {
    const matchId = typeof m.id === "string" ? m.id : "";
    const eventAt = typeof m.created_at === "string" ? m.created_at : null;
    if (!matchId) continue;
    const peer = m.user_a === me ? m.user_b : m.user_a;
    if (typeof peer !== "string" || !peer || peer === me) continue;
    const cid = convByMatch.get(matchId);
    await upsertBellNotification({
      userId: me,
      kind: "new_match",
      dedupeKey: `new_match:${matchId}:${me}`,
      payload: {
        ...actorPayload(peer, actors),
        match_id: matchId,
        conversation_id: cid ?? null,
        route: cid ? `/match/${cid}` : "/messages",
      },
      eventAt,
      existingKeys,
    });
  }
}

async function syncActivityProposals(me: string, existingKeys: Set<string>): Promise<void> {
  const { data: matches } = await supabase
    .from("matches")
    .select("id, user_a, user_b")
    .or(`user_a.eq.${me},user_b.eq.${me}`)
    .limit(50);
  if (!matches?.length) return;

  const matchById = new Map(
    matches
      .filter((m) => typeof m.id === "string")
      .map((m) => [m.id as string, m] as const),
  );
  const matchIds = [...matchById.keys()];
  const { data: convs } = await supabase
    .from("conversations")
    .select("id, match_id")
    .in("match_id", matchIds);
  const convIds = (convs ?? []).map((c) => c.id).filter(Boolean) as string[];
  if (convIds.length === 0) return;

  const matchIdByConv = new Map<string, string>();
  for (const c of convs ?? []) {
    if (typeof c.id === "string" && typeof c.match_id === "string") {
      matchIdByConv.set(c.id, c.match_id);
    }
  }

  const { data: proposals, error } = await supabase
    .from("activity_proposals")
    .select("id, conversation_id, proposer_id, sport, location, status, created_at, counter_of")
    .in("conversation_id", convIds)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error || !proposals?.length) {
    if (error) console.warn("[bellSync] activity_proposals", error.message);
    return;
  }

  const peerIds: string[] = [];
  for (const p of proposals) {
    const proposer = typeof p.proposer_id === "string" ? p.proposer_id : "";
    if (proposer && proposer !== me) peerIds.push(proposer);
    else if (proposer === me) {
      const cid = typeof p.conversation_id === "string" ? p.conversation_id : "";
      const mid = matchIdByConv.get(cid);
      const m = mid ? matchById.get(mid) : undefined;
      const peer = m ? (m.user_a === me ? m.user_b : m.user_a) : null;
      if (typeof peer === "string") peerIds.push(peer);
    }
  }
  const actors = await fetchActorMap(peerIds);

  for (const p of proposals) {
    const id = typeof p.id === "string" ? p.id : "";
    const cid = typeof p.conversation_id === "string" ? p.conversation_id : "";
    const proposer = typeof p.proposer_id === "string" ? p.proposer_id : "";
    const eventAt = typeof p.created_at === "string" ? p.created_at : null;
    if (!id || !cid || !proposer) continue;

    const status = String(p.status ?? "").toLowerCase();
    const sport = typeof p.sport === "string" ? p.sport : "";
    const place = typeof p.location === "string" ? p.location : "";
    const isCounter = p.counter_of != null;
    const route = `/chat/${cid}`;

    if (proposer !== me) {
      const kind = isCounter ? "activity_counter" : "activity_proposed";
      const dedupeKey = isCounter ? `activity_counter:${id}` : `activity_proposed:${id}`;
      await upsertBellNotification({
        userId: me,
        kind,
        dedupeKey,
        payload: {
          ...actorPayload(proposer, actors),
          conversation_id: cid,
          proposal_id: id,
          sport,
          place,
          route,
        },
        eventAt,
        existingKeys,
      });
    } else if (status === "accepted") {
      const mid = matchIdByConv.get(cid);
      const m = mid ? matchById.get(mid) : undefined;
      const peer = m ? (m.user_a === me ? m.user_b : m.user_a) : null;
      const peerId = typeof peer === "string" ? peer : "";
      if (!peerId) continue;
      await upsertBellNotification({
        userId: me,
        kind: "activity_accepted",
        dedupeKey: `activity_accepted:${id}`,
        payload: {
          ...actorPayload(peerId, actors),
          conversation_id: cid,
          proposal_id: id,
          sport,
          place,
          route,
        },
        eventAt,
        existingKeys,
      });
    }
  }
}

async function syncFirstMessages(me: string, existingKeys: Set<string>): Promise<void> {
  const { data: matches } = await supabase
    .from("matches")
    .select("id")
    .or(`user_a.eq.${me},user_b.eq.${me}`)
    .limit(50);
  if (!matches?.length) return;

  const matchIds = matches.map((m) => m.id).filter(Boolean) as string[];
  const { data: convs } = await supabase
    .from("conversations")
    .select("id")
    .in("match_id", matchIds);
  const convIds = (convs ?? []).map((c) => c.id).filter(Boolean) as string[];
  if (convIds.length === 0) return;

  const { data: messages, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .select("id, conversation_id, sender_id, message_type, created_at")
    .in("conversation_id", convIds)
    .neq("sender_id", me)
    .order("created_at", { ascending: true })
    .limit(120);

  if (error || !messages?.length) {
    if (error) console.warn("[bellSync] messages", error.message);
    return;
  }

  const firstByConv = new Map<string, (typeof messages)[number]>();
  for (const msg of messages) {
    const cid = typeof msg.conversation_id === "string" ? msg.conversation_id : "";
    if (!cid || firstByConv.has(cid)) continue;
    const mt = String(msg.message_type ?? "text").toLowerCase();
    if (mt === "activity_proposal" || mt === "activity_proposal_response") continue;
    firstByConv.set(cid, msg);
  }

  const senderIds = [...firstByConv.values()]
    .map((m) => (typeof m.sender_id === "string" ? m.sender_id : ""))
    .filter(Boolean);
  const actors = await fetchActorMap(senderIds);

  for (const [cid, msg] of firstByConv) {
    const msgId = typeof msg.id === "string" ? msg.id : "";
    const sender = typeof msg.sender_id === "string" ? msg.sender_id : "";
    const eventAt = typeof msg.created_at === "string" ? msg.created_at : null;
    if (!msgId || !sender || sender === me) continue;
    await upsertBellNotification({
      userId: me,
      kind: "new_message",
      dedupeKey: `new_message:first:${cid}`,
      payload: {
        ...actorPayload(sender, actors),
        conversation_id: cid,
        route: `/chat/${cid}`,
      },
      eventAt,
      existingKeys,
    });
  }
}
