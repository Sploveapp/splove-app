/**
 * Géoloc utile Discover — pas de carte, libellés approximatifs.
 */

export function formatDiscoverDistanceLabel(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  if (km < 1) return "A moins de 1 km";
  return `A ${Math.round(km)} km`;
}

function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a?.trim().toLowerCase();
  const y = b?.trim().toLowerCase();
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
  const city = opts.profileCity?.trim() || null;
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

/**
 * @returns null si refus / indisponible / timeout
 */
export function getCurrentPositionCoords(timeoutMs = 12000): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation?.getCurrentPosition) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const t = window.setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(t);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          resolve(null);
          return;
        }
        resolve({ lat, lng });
      },
      () => {
        window.clearTimeout(t);
        resolve(null);
      },
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: timeoutMs },
    );
  });
}
