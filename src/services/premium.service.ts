import { BETA_MODE } from "../constants/beta";
import { supabase } from "../lib/supabase";
import {
  SUBSCRIPTIONS_SELECT_MINIMAL,
  SUBSCRIPTIONS_SELECT_WITHOUT_ENDS_AT,
  SUBSCRIPTIONS_SELECT_WITH_ENDS_AT,
  errorMentionsColumn,
  isSubscriptionsColumnError,
} from "../lib/subscriptionsQuery";
import { isMissingSupabaseResourceError, warnOptional } from "../lib/optionalSupabase";
import type { Subscription } from "../types/premium.types";

const ACTIVE_STATUS = "active";

/**
 * Abonnement actif :
 * - avec `ends_at` : status = active ET (ends_at IS NULL OU ends_at > maintenant)
 * - sans `ends_at` en base : status = active uniquement (pas d’expiration côté SQL)
 */
export async function getActiveSubscription(
  profileId: string,
): Promise<Subscription | null> {
  const nowIso = new Date().toISOString();

  const withEnd = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTIONS_SELECT_WITH_ENDS_AT)
    .eq("profile_id", profileId)
    .eq("status", ACTIVE_STATUS)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order("ends_at", { ascending: false, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (!withEnd.error) {
    return withEnd.data as Subscription | null;
  }

  if (isMissingSupabaseResourceError(withEnd.error)) {
    warnOptional("subscriptions.profile_id", withEnd.error);
    return null;
  }

  if (
    isSubscriptionsColumnError(withEnd.error) &&
    errorMentionsColumn(withEnd.error, "ends_at")
  ) {
    console.warn(
      "[getActiveSubscription] subscriptions.ends_at absent — repli sur status + started_at uniquement",
    );
    const noEnd = await supabase
      .from("subscriptions")
      .select(SUBSCRIPTIONS_SELECT_WITHOUT_ENDS_AT)
      .eq("profile_id", profileId)
      .eq("status", ACTIVE_STATUS)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!noEnd.error) {
      return noEnd.data as Subscription | null;
    }

    if (isSubscriptionsColumnError(noEnd.error)) {
      const minimal = await supabase
        .from("subscriptions")
        .select(SUBSCRIPTIONS_SELECT_MINIMAL)
        .eq("profile_id", profileId)
        .eq("status", ACTIVE_STATUS)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!minimal.error) {
        return minimal.data as Subscription | null;
      }
      console.warn("[premium] getActiveSubscription", minimal.error.message ?? minimal.error);
      return null;
    }

    console.warn("[premium] getActiveSubscription", noEnd.error.message ?? noEnd.error);
    return null;
  }

  if (isSubscriptionsColumnError(withEnd.error)) {
    const minimal = await supabase
      .from("subscriptions")
      .select(SUBSCRIPTIONS_SELECT_MINIMAL)
      .eq("profile_id", profileId)
      .eq("status", ACTIVE_STATUS)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!minimal.error) {
      return minimal.data as Subscription | null;
    }
  }

  console.warn("[premium] getActiveSubscription", withEnd.error.message ?? withEnd.error);
  return null;
}

const REFERRAL_PLUS_SKIP_KEY = "splove_referral_plus_until_skip_v1";

function isReferralPlusUntilSkipped(): boolean {
  try {
    return sessionStorage.getItem(REFERRAL_PLUS_SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

async function referralPlusOrBeta(profileId: string): Promise<boolean> {
  let cols = isReferralPlusUntilSkipped()
    ? ["beta_splove_plus_unlocked"]
    : ["referral_plus_until", "beta_splove_plus_unlocked"];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabase
      .from("profiles")
      .select(cols.join(", "))
      .eq("id", profileId)
      .maybeSingle();

    if (!error) {
      const row = data as {
        referral_plus_until?: string | null;
        beta_splove_plus_unlocked?: boolean | null;
      } | null;
      if (row?.beta_splove_plus_unlocked === true) return true;
      const u = row?.referral_plus_until ?? null;
      return Boolean(u && new Date(u).getTime() > Date.now());
    }

    const low = (error.message ?? "").toLowerCase();
    const missing =
      error.code === "42703" || low.includes("does not exist") || low.includes("could not find");
    if (!missing) return false;

    const m = (error.message ?? "").match(/column\s+["']?([a-zA-Z0-9_]+)["']?/i);
    const missingCol = m?.[1] ?? null;
    if (missingCol === "referral_plus_until") {
      try {
        sessionStorage.setItem(REFERRAL_PLUS_SKIP_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    if (!missingCol || !cols.includes(missingCol)) {
      cols = cols.filter((c) => c !== "referral_plus_until");
    } else {
      cols = cols.filter((c) => c !== missingCol);
    }
    if (cols.length === 0) return false;
  }

  return false;
}

/**
 * Indique si l'utilisateur a accès à SPLove+ (abonnement actif, parrainage temporaire, ou beta via parrain).
 */
export async function hasPremiumAccess(profileId: string): Promise<boolean> {
  if (BETA_MODE) return true;
  const sub = await getActiveSubscription(profileId);
  if (sub != null) return true;
  return referralPlusOrBeta(profileId);
}
