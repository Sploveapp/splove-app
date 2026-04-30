/**
 * Referral SPLove — helpers analytics & codes.
 *
 * Tables Postgres attendues (à créer côté Supabase / migration manuelle si besoin) :
 *
 * referral_codes:
 * - id uuid (default gen_random_uuid())
 * - user_id uuid not null references auth.users(id) on delete cascade
 * - code text not null unique
 * - created_at timestamptz default now()
 *
 * referral_events:
 * - id uuid (default gen_random_uuid())
 * - user_id uuid references auth.users(id) on delete set null
 * - event_name text not null
 * - payload jsonb
 * - created_at timestamptz default now()
 */

import { supabase } from "./supabase";
import { fetchGrowthProfileFields } from "../services/referral.service";

function hashDigitsFromUserId(userId: string, salt: number): string {
  let h = salt >>> 0;
  for (let i = 0; i < userId.length; i++) {
    h = (((h << 5) - h + userId.charCodeAt(i)) | 0) >>> 0;
  }
  return String(h % 10000).padStart(4, "0");
}

function sanitizeFirstNameParts(firstName?: string | null): string {
  const raw = (firstName ?? "").normalize("NFKD").replace(/\p{M}/gu, "");
  const alnum = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return alnum.slice(0, 6) || "SPLOVE";
}

export function getReferralVariant(userId: string): "A" | "B" | "C" {
  let h = 5381;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 33 + userId.charCodeAt(i)) >>> 0;
  }
  const variants: ("A" | "B" | "C")[] = ["A", "B", "C"];
  return variants[h % 3];
}

function buildCandidateCode(userId: string, firstName?: string | null, attempt = 0): string {
  const prefix = sanitizeFirstNameParts(firstName);
  const digits = hashDigitsFromUserId(userId, attempt + 17);
  const combined = `${prefix}${attempt > 0 ? attempt : ""}${digits}`.toUpperCase();
  return combined.replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

/**
 * Lien d’invitation (HashRouter + base Vite).
 */
export function buildInviteAuthUrl(referralCode: string | null | undefined): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
  const ref = String(referralCode ?? "").trim();
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "?ref=";
  return `${origin}${base}#/auth${q}`;
}

export async function getOrCreateReferralCode(
  userId: string,
  firstName?: string | null,
): Promise<string | null> {
  try {
    const { data: row, error: selErr } = await supabase
      .from("referral_codes")
      .select("code")
      .eq("user_id", userId)
      .maybeSingle();

    if (selErr) {
      const low = (selErr.message ?? "").toLowerCase();
      if (selErr.code !== "PGRST116" && !low.includes("does not exist") && selErr.code !== "42P01") {
        console.warn("[referral] referral_codes select", selErr.message);
      }
    } else if (row && typeof (row as { code?: string }).code === "string") {
      const c = (row as { code: string }).code.trim();
      if (c) return c;
    }

    for (let attempt = 0; attempt < 8; attempt++) {
      const code = buildCandidateCode(userId, firstName, attempt);
      if (code.length < 4) continue;
      const { error: insErr } = await supabase.from("referral_codes").insert({
        user_id: userId,
        code,
      });
      if (!insErr) return code;
      const msg = (insErr.message ?? "").toLowerCase();
      if (insErr.code === "23505" || msg.includes("unique")) continue;
      if (insErr.code === "42P01" || msg.includes("does not exist")) break;
      console.warn("[referral] referral_codes insert", insErr.message);
      break;
    }

    const fromProfile = await fetchGrowthProfileFields(userId);
    const legacy = fromProfile?.referral_code?.trim();
    return legacy || null;
  } catch (e) {
    console.warn("[referral] getOrCreateReferralCode", e);
    return null;
  }
}

export async function trackReferralEvent(
  eventName: string,
  payload?: Record<string, any>,
): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id ?? null;
    const { error } = await supabase.from("referral_events").insert({
      user_id: uid,
      event_name: eventName,
      payload: payload ?? {},
    });
    if (error) {
      const low = (error.message ?? "").toLowerCase();
      if (error.code !== "42P01" && !low.includes("does not exist")) {
        console.warn("[referral] referral_events insert", error.message);
      }
    }
  } catch (e) {
    console.warn("[referral] trackReferralEvent", e);
  }
}
