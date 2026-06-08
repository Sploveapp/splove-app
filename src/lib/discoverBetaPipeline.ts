import { BETA_MODE } from "../constants/beta";
import { hasFiniteDiscoverCoordinates, isValidDiscoveryRadiusKm } from "../constants/discoverGeo";

/**
 * TEMPORAIRE — pipeline Discover simplifié (stabilité bêta).
 * Désactiver en passant `VITE_BETA_MODE` à false une fois le schéma prod aligné.
 */
export const DISCOVER_BETA_SIMPLE_PIPELINE = BETA_MODE;

export function viewerOnboardingFlagsAllowDiscover(viewer: Record<string, unknown>): boolean {
  return (
    viewer.profile_completed === true ||
    (viewer as { onboarding_completed?: unknown }).onboarding_completed === true ||
    (viewer as { onboarding_done?: unknown }).onboarding_done === true
  );
}

export function shouldBypassDiscoverViewerIntegrity(viewer: Record<string, unknown>): boolean {
  return DISCOVER_BETA_SIMPLE_PIPELINE && viewerOnboardingFlagsAllowDiscover(viewer);
}

function coordNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Distance km viewer → candidats (sans RPC `profile_distances_from_viewer`). */
export function buildClientDiscoverDistanceById(
  viewer: { latitude?: unknown; longitude?: unknown },
  candidates: { id: string; latitude?: unknown; longitude?: unknown }[],
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const vLat = coordNum(viewer.latitude);
  const vLng = coordNum(viewer.longitude);
  if (vLat == null || vLng == null) return out;

  for (const c of candidates) {
    const cLat = coordNum(c.latitude);
    const cLng = coordNum(c.longitude);
    if (cLat == null || cLng == null) {
      out.set(c.id, null);
      continue;
    }
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(cLat - vLat);
    const dLng = toRad(cLng - vLng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(vLat)) * Math.cos(toRad(cLat)) * Math.sin(dLng / 2) ** 2;
    const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    out.set(c.id, Number.isFinite(km) ? Math.round(km * 10) / 10 : null);
  }
  return out;
}

export function isOutsideDiscoverRadius(
  distanceKm: number | null,
  viewerRadiusKm: unknown,
): boolean {
  if (!isValidDiscoveryRadiusKm(viewerRadiusKm)) return false;
  if (distanceKm == null || !Number.isFinite(distanceKm)) return false;
  return distanceKm > Math.round(viewerRadiusKm as number);
}

export function candidateHasDiscoverGps(p: { latitude?: unknown; longitude?: unknown }): boolean {
  return hasFiniteDiscoverCoordinates(p);
}

const DISCOVER_FREE_VISIBILITY_HOURS = 24;
const DISCOVER_PREMIUM_VISIBILITY_HOURS = 72;

/** Fenêtre de visibilité Discover (prod). En bêta : ne jamais exclure. */
export function isWithinDiscoverVisibilityWindow(
  createdAt: string | null | undefined,
  isPremium: boolean,
): boolean {
  const raw = typeof createdAt === "string" ? createdAt.trim() : "";
  if (!raw) return false;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return false;
  const maxHours = isPremium ? DISCOVER_PREMIUM_VISIBILITY_HOURS : DISCOVER_FREE_VISIBILITY_HOURS;
  return Date.now() - ts <= maxHours * 60 * 60 * 1000;
}

export type DiscoverVisibilityWindowProfile = {
  id: string;
  first_name?: string | null;
  created_at?: string | null;
};

/**
 * Filtre `discover_visibility_window` : désactivé en bêta (warning-only).
 * Prod : exclut les profils hors fenêtre ou sans `created_at` valide.
 */
export function filterDiscoverVisibilityWindow<T extends DiscoverVisibilityWindowProfile>(
  candidates: T[],
  isPremium: boolean,
): { kept: T[]; betaWarnings: number } {
  if (DISCOVER_BETA_SIMPLE_PIPELINE) {
    let betaWarnings = 0;
    for (const p of candidates) {
      if (isWithinDiscoverVisibilityWindow(p.created_at ?? null, isPremium)) continue;
      betaWarnings += 1;
      console.warn("[Discover pipeline] discover_visibility_window (beta keep)", {
        step: "discover_visibility_window",
        id: p.id,
        first_name: p.first_name ?? null,
        created_at: p.created_at ?? null,
        exclusion_reason: "missing required field",
        pipeline_detail: "discover_visibility_window",
        beta_keep: true,
      });
    }
    return { kept: candidates, betaWarnings };
  }

  const kept = candidates.filter((p) =>
    isWithinDiscoverVisibilityWindow(p.created_at ?? null, isPremium),
  );
  return { kept, betaWarnings: 0 };
}
