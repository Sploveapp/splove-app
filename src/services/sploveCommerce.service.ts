import {
  SPLOVE_IAP_PRODUCT_IDS,
  type SploveActivationSource,
  type SploveCreditType,
  type SploveIapProductId,
} from "../types/sploveCommerce.types";
import { supabase } from "../lib/supabase";

/** Receipt / Play token validation — implement server-side later; web stub always fails open to “manual grant”. */
export type PurchaseVerificationResult =
  | { valid: true; note?: string }
  | { valid: false; reason: string };

function creditTypeUsesCatalogDuration(ft: SploveCreditType): boolean {
  return ft === "boost_visibility" || ft === "ghost_mode" || ft === "priority_meet";
}

/** Placeholder IAP (no StoreKit / Play Billing yet). Simulates fulfilment via Supabase RPC. */
export async function purchaseProduct(productId: SploveIapProductId): Promise<{
  ok: boolean;
  error?: string;
  purchase_id?: string;
}> {
  const { data, error } = await supabase.rpc("splove_complete_mock_purchase", {
    p_product_id: productId,
  });

  if (error) {
    console.warn("[sploveCommerce] purchaseProduct", error);
    return { ok: false, error: error.message };
  }

  const row = data as { ok?: boolean; purchase_id?: string; error?: string } | null;
  if (row?.ok !== true) {
    return { ok: false, error: typeof row?.error === "string" ? row.error : "purchase_failed" };
  }

  return { ok: true, purchase_id: typeof row?.purchase_id === "string" ? row.purchase_id : undefined };
}

/** Future: call Edge Functions + Apple / Google after Store SDK; then grantCredit or complete purchase RPC. */
export async function verifyPurchase(
  platform: "ios" | "android" | "web",
  receiptOrToken: string,
): Promise<PurchaseVerificationResult> {
  console.info("[sploveCommerce] verifyPurchase stub", { platform, tokenLen: receiptOrToken?.length ?? 0 });
  return { valid: false, reason: "verification_not_implemented" };
}

async function ensureSelf(userId: string): Promise<boolean> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return false;
  return data.user?.id === userId;
}

/** Grant credits once purchase is verified (or admin tooling). Prefer server-side verification before calling. */
export async function grantCredit(
  userId: string,
  creditType: SploveCreditType,
  quantity: number,
  options?: {
    reason?: string;
    purchaseId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; balance_after?: number; error?: string }> {
  if (!(await ensureSelf(userId))) {
    return { ok: false, error: "auth_mismatch" };
  }

  const { data, error } = await supabase.rpc("splove_grant_credit", {
    p_credit_type: creditType,
    p_quantity: quantity,
    p_reason: options?.reason ?? "grant",
    p_purchase_id: options?.purchaseId ?? null,
    p_metadata: (options?.metadata ?? {}) as never,
  });

  if (error) return { ok: false, error: error.message };

  const row = data as { ok?: boolean; balance_after?: number; error?: string } | null;
  if (row?.ok !== true) {
    return { ok: false, error: typeof row?.error === "string" ? row.error : "grant_failed" };
  }

  return { ok: true, balance_after: typeof row.balance_after === "number" ? row.balance_after : undefined };
}

/** Consume one credit without activating any feature (rare tooling path). */
export async function consumeCredit(
  userId: string,
  creditType: SploveCreditType,
): Promise<{ ok: boolean; need_purchase?: boolean; balance_after?: number; error?: string }> {
  if (!(await ensureSelf(userId))) {
    return { ok: false, error: "auth_mismatch" };
  }

  const { data, error } = await supabase.rpc("splove_consume_credit", {
    p_credit_type: creditType,
  });

  if (error) return { ok: false, error: error.message };

  const row = data as { ok?: boolean; need_purchase?: boolean; balance_after?: number } | null;
  if (row?.need_purchase === true) {
    return { ok: false, need_purchase: true };
  }
  if (row?.ok !== true) {
    return { ok: false, error: "consume_failed" };
  }

  return { ok: true, balance_after: typeof row.balance_after === "number" ? row.balance_after : undefined };
}

/**
 * After UI confirmation: consume credit (if `source=credit`), write ledger (`beta_activation` when `beta`),
 * insert `feature_activations` rows for timed perks, bump profile counters for one-shot perks.
 * `durationMinutes` must match the catalog window (30 / 1440 / 1440); server rejects mismatches.
 */
export async function activateFeature(
  userId: string,
  featureType: SploveCreditType,
  durationMinutes: number,
  source: SploveActivationSource,
): Promise<{
  ok: boolean;
  need_purchase?: boolean;
  error?: string;
  expires_at?: string | null;
}> {
  if (!(await ensureSelf(userId))) {
    return { ok: false, error: "auth_mismatch" };
  }

  const { data, error } = await supabase.rpc("splove_activate_feature", {
    p_feature_type: featureType,
    p_source: source,
    p_duration_minutes: creditTypeUsesCatalogDuration(featureType)
      ? durationMinutes
      : null,
  });

  if (error) return { ok: false, error: error.message };

  const row = data as { ok?: boolean; need_purchase?: boolean; error?: string; expires_at?: string | null } | null;
  if (row?.need_purchase === true) {
    return { ok: false, need_purchase: true };
  }
  if (row?.ok !== true) {
    return { ok: false, error: typeof row?.error === "string" ? row.error : "activate_failed" };
  }

  return {
    ok: true,
    expires_at: typeof row.expires_at === "string" ? row.expires_at : null,
  };
}

/** Map SPLove+ feature card product for mock purchase UX. */
export function productIdForCreditType(ct: SploveCreditType): SploveIapProductId {
  const map: Record<SploveCreditType, SploveIapProductId> = {
    boost_visibility: SPLOVE_IAP_PRODUCT_IDS.boost30m,
    ghost_mode: SPLOVE_IAP_PRODUCT_IDS.ghost24h,
    undo_swipe: SPLOVE_IAP_PRODUCT_IDS.undo1,
    second_chance: SPLOVE_IAP_PRODUCT_IDS.secondChance1,
    priority_meet: SPLOVE_IAP_PRODUCT_IDS.priorityMeet24h,
  };
  return map[ct];
}
