/**
 * Requêtes `public.subscriptions` — colonnes alignées sur les migrations du dépôt :
 *
 * **002_splove_plus.sql** : id, profile_id, plan, status, started_at, ends_at, created_at, updated_at
 * **003_splove_plus_complete.sql** : + external_id, provider
 *
 * Certaines bases distantes peuvent ne pas avoir `ends_at` : dans ce cas on retombe sur
 * un select sans cette colonne et l’« actif » = `status = 'active'` uniquement.
 */

export const SUBSCRIPTIONS_SELECT_WITH_ENDS_AT =
  "id, profile_id, plan, status, started_at, ends_at, created_at, updated_at, external_id, provider";

/** Sans ends_at (ni filtre d’expiration côté SQL). */
export const SUBSCRIPTIONS_SELECT_WITHOUT_ENDS_AT =
  "id, profile_id, plan, status, started_at, created_at, updated_at, external_id, provider";

/** Minimal si external_id / provider absents (vieux schéma). */
export const SUBSCRIPTIONS_SELECT_MINIMAL =
  "id, profile_id, plan, status, started_at, created_at, updated_at";

export function isSubscriptionsColumnError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  const msg = (err.message ?? "").toLowerCase();
  return code === "42703" || msg.includes("does not exist") || msg.includes("column");
}

export function errorMentionsColumn(err: { message?: string } | null, column: string): boolean {
  const msg = (err?.message ?? "").toLowerCase();
  const col = column.toLowerCase();
  return msg.includes(col) && (msg.includes("does not exist") || msg.includes("column"));
}
