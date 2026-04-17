import { BETA_MODE } from "../constants/beta";
import { supabase } from "../lib/supabase";
import {
  SUBSCRIPTIONS_SELECT_MINIMAL,
  SUBSCRIPTIONS_SELECT_WITHOUT_ENDS_AT,
  SUBSCRIPTIONS_SELECT_WITH_ENDS_AT,
  errorMentionsColumn,
  isSubscriptionsColumnError,
} from "../lib/subscriptionsQuery";
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
      console.error("getActiveSubscription", minimal.error);
      return null;
    }

    console.error("getActiveSubscription", noEnd.error);
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

  console.error("getActiveSubscription", withEnd.error);
  return null;
}

/**
 * Indique si l'utilisateur a accès à SPLove+ (abonnement actif).
 */
export async function hasPremiumAccess(profileId: string): Promise<boolean> {
  if (BETA_MODE) return true;
  const sub = await getActiveSubscription(profileId);
  return sub != null;
}
