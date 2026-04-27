import { supabase } from "../lib/supabase";

export const PENDING_REFERRAL_STORAGE_KEY = "splove_pending_referral_code";

export function stashPendingReferralCodeFromSearch(refParam: string | null): void {
  const t = (refParam ?? "").trim().toUpperCase();
  if (t.length < 4) return;
  try {
    sessionStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
}

/**
 * Tente d'appliquer le code stocké (après création de profil). Idempotent côté serveur.
 */
export async function tryClaimPendingReferralCode(): Promise<{ ok: boolean; error?: string }> {
  let code: string | null = null;
  try {
    code = sessionStorage.getItem(PENDING_REFERRAL_STORAGE_KEY);
  } catch {
    return { ok: false, error: "storage" };
  }
  if (!code || code.length < 4) return { ok: true };

  const { data, error } = await supabase.rpc("claim_referral_invite", { p_code: code });
  if (error) {
    console.warn("[referral] claim_referral_invite", error.message);
    return { ok: false, error: error.message };
  }
  const j = (data ?? null) as { ok?: boolean; error?: string } | null;
  if (j?.ok) {
    try {
      sessionStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return { ok: true };
  }
  if (j?.error === "already_referred" || j?.error === "self_referral") {
    try {
      sessionStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  return { ok: Boolean(j?.ok), error: j?.error };
}

/** Lien d’inscription avec parrain (HashRouter : path en hash). */
export function buildAuthReferralLink(referralCode: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
  return `${origin}${base}#/auth?ref=${encodeURIComponent(referralCode)}`;
}

export type GrowthProfileRow = {
  referral_code: string | null;
  referred_by_user_id: string | null;
  rewind_credits: number | null;
  referral_plus_until: string | null;
};

export async function fetchGrowthProfileFields(
  userId: string,
): Promise<GrowthProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("referral_code, referred_by_user_id, rewind_credits, referral_plus_until")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    const low = (error.message ?? "").toLowerCase();
    if (error.code === "42703" || low.includes("does not exist")) {
      return null;
    }
    console.warn("[referral] fetchGrowthProfileFields", error.message);
    return null;
  }
  return data as GrowthProfileRow;
}
