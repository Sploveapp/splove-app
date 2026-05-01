import { supabase } from "../lib/supabase";

export const PENDING_REFERRAL_STORAGE_KEY = "splove_pending_referral_code";

function migrateSessionPendingReferralToLocal(): void {
  try {
    const fromSs = sessionStorage.getItem(PENDING_REFERRAL_STORAGE_KEY);
    if (!fromSs) return;
    if (!localStorage.getItem(PENDING_REFERRAL_STORAGE_KEY)) {
      localStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, fromSs);
    }
    sessionStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function stashPendingReferralCodeFromSearch(refParam: string | null): void {
  const t = (refParam ?? "").trim().toUpperCase();
  if (t.length < 4) return;
  try {
    localStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, t);
    try {
      sessionStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

function readPendingReferralCode(): string | null {
  migrateSessionPendingReferralToLocal();
  try {
    return localStorage.getItem(PENDING_REFERRAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearPendingReferralCode(): void {
  try {
    localStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

type CompleteReferralRpc = {
  ok?: boolean;
  error?: string;
  already_completed?: boolean;
};

/**
 * Après profil créé + onboarding terminé : applique le code ?ref= (localStorage).
 * Idempotent ; auth.uid doit être p_user_id.
 */
export async function tryCompletePendingReferral(userId: string): Promise<{ ok: boolean; error?: string }> {
  const code = readPendingReferralCode();
  if (!code || code.length < 4) return { ok: true };

  const { data, error } = await supabase.rpc("complete_referral", {
    p_user_id: userId,
    p_referral_code: code,
  });

  if (error) {
    console.warn("[referral] complete_referral", error.message);
    return { ok: false, error: error.message };
  }

  const j = (data ?? null) as CompleteReferralRpc | null;
  if (j?.ok === true) {
    clearPendingReferralCode();
    return { ok: true };
  }
  const fatal = ["self_referral", "already_referred"];
  if (j?.error && fatal.includes(j.error)) {
    clearPendingReferralCode();
  }
  return { ok: Boolean(j?.ok), error: j?.error };
}

export type GrowthProfileRow = {
  referral_code: string | null;
  referred_by_user_id: string | null;
  rewind_credits: number | null;
  referral_plus_until: string | null;
  boost_credits?: number | null;
  beta_splove_plus_unlocked?: boolean | null;
};

export async function fetchGrowthProfileFields(userId: string): Promise<GrowthProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "referral_code, referred_by_user_id, rewind_credits, referral_plus_until, boost_credits, beta_splove_plus_unlocked",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    const low = (error.message ?? "").toLowerCase();
    if (error.code === "42703" || low.includes("does not exist")) {
      const fallback = await supabase
        .from("profiles")
        .select("referral_code, referred_by_user_id, rewind_credits, referral_plus_until")
        .eq("id", userId)
        .maybeSingle();
      if (fallback.error) return null;
      return fallback.data as GrowthProfileRow;
    }
    console.warn("[referral] fetchGrowthProfileFields", error.message);
    return null;
  }
  return data as GrowthProfileRow;
}

/** Lien d’inscription avec parrain (HashRouter : path en hash). */
export function buildAuthReferralLink(referralCode: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
  return `${origin}${base}#/auth?ref=${encodeURIComponent(referralCode)}`;
}

/** Lien public pour partages (marketing) — doit rediriger côté hôte vers `/auth` + `ref` si besoin. */
export function buildPublicSploveInviteLink(referralCode: string): string {
  const code = referralCode.trim().toUpperCase();
  return `https://splove.app?ref=${encodeURIComponent(code)}`;
}

/** Nombre de lignes où l’utilisateur est parrain (tous statuts). */
export async function countReferralsRowsByReferrer(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", userId);
  if (error) {
    console.warn("[referral] countReferralsRowsByReferrer", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Nombre de filleuls récompensés (referrals.status = rewarded). */
export async function countReferralsAsReferrer(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", userId)
    .eq("status", "rewarded");
  if (error) {
    console.warn("[referral] countReferralsAsReferrer", error.message);
    return 0;
  }
  return count ?? 0;
}
