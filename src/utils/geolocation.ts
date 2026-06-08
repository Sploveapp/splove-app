/**
 * Géoloc utile Discover — pas de carte, libellés approximatifs.
 */

import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { formatCityDisplay } from "../lib/formatCityDisplay";
import { isNativeCapacitorApp } from "../lib/authRedirect";

export function formatDiscoverDistanceLabel(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  if (km < 1) return "A moins de 1 km";
  return `A ${Math.round(km)} km`;
}

function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = formatCityDisplay(a).toLowerCase();
  const y = formatCityDisplay(b).toLowerCase();
  return Boolean(x && y && x === y);
}

/**
 * Lignes pour cartes Discover : distance > secteur commun > ville seule.
 */
export function buildDiscoverLocationLines(opts: {
  distanceKm: number | null | undefined;
  viewerCity: string | null;
  profileCity: string | null;
  labels?: {
    sameSector?: string;
    zoneHintPrefix?: string;
  };
}): { line1: string | null; line2: string | null } {
  const dist = formatDiscoverDistanceLabel(opts.distanceKm);
  const city =
    opts.profileCity != null ? formatCityDisplay(opts.profileCity) || null : null;
  if (dist) {
    return { line1: dist, line2: city ?? null };
  }
  if (sameCity(opts.viewerCity, opts.profileCity)) {
    return { line1: opts.labels?.sameSector ?? "Dans ton secteur", line2: null };
  }
  if (city) {
    return { line1: `${opts.labels?.zoneHintPrefix ?? "Area hint"} · ${city}`, line2: null };
  }
  return { line1: null, line2: null };
}

export function formatViewerRadiusLabel(radiusKm: number | null | undefined): string | null {
  if (radiusKm == null || !Number.isFinite(radiusKm) || radiusKm <= 0) return null;
  return `Rayon de recherche : ${Math.round(radiusKm)} km`;
}

function coordsFromPosition(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function isLocationPermissionGranted(
  status: Awaited<ReturnType<typeof Geolocation.requestPermissions>>,
): boolean {
  if (Capacitor.getPlatform() === "android") {
    return status.location === "granted" || status.coarseLocation === "granted";
  }
  return status.location === "granted";
}

/** iOS/Android : demande d’abord la permission système, puis lecture GPS. */
async function getCurrentPositionCoordsNative(
  timeoutMs: number,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const permission = await Geolocation.requestPermissions();
    if (!isLocationPermissionGranted(permission)) {
      console.warn("[geolocation] permission not granted", permission);
      return null;
    }

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: timeoutMs,
      maximumAge: 120_000,
    });

    return coordsFromPosition(pos.coords.latitude, pos.coords.longitude);
  } catch (e) {
    console.warn("[geolocation] native getCurrentPosition failed", e);
    return null;
  }
}

/** Web : popup navigateur via getCurrentPosition (pas de requestPermissions séparé). */
function getCurrentPositionCoordsWeb(timeoutMs: number): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation?.getCurrentPosition) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const t = window.setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(t);
        resolve(coordsFromPosition(pos.coords.latitude, pos.coords.longitude));
      },
      (err) => {
        window.clearTimeout(t);
        console.warn("[geolocation] web getCurrentPosition failed", err?.message ?? err);
        resolve(null);
      },
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: timeoutMs },
    );
  });
}

/**
 * @returns null si refus / indisponible / timeout
 */
export async function getCurrentPositionCoords(
  timeoutMs = 12000,
): Promise<{ lat: number; lng: number } | null> {
  if (isNativeCapacitorApp()) {
    return getCurrentPositionCoordsNative(timeoutMs);
  }
  return getCurrentPositionCoordsWeb(timeoutMs);
}
