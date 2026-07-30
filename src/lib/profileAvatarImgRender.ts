/**
 * Helpers de rendu avatar circulaire « Mon profil » (Profile.tsx uniquement).
 * Pas de pipeline CapacitorHttp / cache — uniquement clé React + décisions load/error.
 */

/** Empreinte déterministe légère (longueur + portions) — pas toute la base64 dans le DOM. */
export function fingerprintProfileAvatarImgSrc(src: string): string {
  const s = src.trim();
  if (!s) return "empty";
  const len = s.length;
  const head = s.slice(0, 24);
  const midStart = Math.max(0, Math.floor(len / 2) - 12);
  const mid = s.slice(midStart, midStart + 24);
  const tail = s.slice(-24);
  const sample = `${len}|${head}|${mid}|${tail}`;
  let h = 2166136261;
  for (let i = 0; i < sample.length; i += 1) {
    h ^= sample.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `v1_${len}_${(h >>> 0).toString(36)}`;
}

/** Clé React unique pour remonter l’`<img>` sans exposer la Data URL complète. */
export function profileAvatarImgReactKey(
  src: string | null | undefined,
  revision = 0,
): string {
  const t = typeof src === "string" ? src.trim() : "";
  if (!t) return `empty_r${revision}`;
  return `${fingerprintProfileAvatarImgSrc(t)}_r${revision}`;
}

export type ProfileAvatarImgLoadDecision = {
  acceptAsLoaded: boolean;
  clearError: boolean;
  treatAsError: boolean;
  reason: string;
};

export function decideProfileAvatarImgLoad(input: {
  naturalWidth: number;
  naturalHeight: number;
  eventSrc: string | null | undefined;
  activeSrc: string | null | undefined;
}): ProfileAvatarImgLoadDecision {
  const eventSrc = typeof input.eventSrc === "string" ? input.eventSrc : null;
  const activeSrc = typeof input.activeSrc === "string" ? input.activeSrc : null;
  if (eventSrc && activeSrc && eventSrc !== activeSrc) {
    return {
      acceptAsLoaded: false,
      clearError: false,
      treatAsError: false,
      reason: "stale_load_ignored",
    };
  }
  if (input.naturalWidth > 0 && input.naturalHeight > 0) {
    return {
      acceptAsLoaded: true,
      clearError: true,
      treatAsError: false,
      reason: "natural_size_ok",
    };
  }
  return {
    acceptAsLoaded: false,
    clearError: false,
    treatAsError: true,
    reason: "zero_natural_size_treated_as_error",
  };
}

export type ProfileAvatarImgErrorDecision = {
  applyPreferDirectHttps: boolean;
  callHandlersOnError: boolean;
  lockHttpsFallback: boolean;
  reason: string;
};

/**
 * Décision onError / fallback HTTPS.
 * - Ignore les événements d’un ancien `<img>` (source ≠ active).
 * - Un seul bascule Data/blob → HTTPS ; verrou anti-boucle sur l’empreinte.
 */
export function decideProfileAvatarImgError(input: {
  eventSrc: string | null | undefined;
  activeSrc: string | null | undefined;
  sourceKind: string | null | undefined;
  preferDirectHttpsAlready: boolean;
  httpsFallbackLockedForFingerprint: string | null;
  activeFingerprint: string | null;
}): ProfileAvatarImgErrorDecision {
  const eventSrc = typeof input.eventSrc === "string" ? input.eventSrc : null;
  const activeSrc = typeof input.activeSrc === "string" ? input.activeSrc : null;

  if (!eventSrc || !activeSrc || eventSrc !== activeSrc) {
    return {
      applyPreferDirectHttps: false,
      callHandlersOnError: false,
      lockHttpsFallback: false,
      reason: "stale_error_ignored",
    };
  }

  if (input.preferDirectHttpsAlready) {
    return {
      applyPreferDirectHttps: false,
      callHandlersOnError: true,
      lockHttpsFallback: false,
      reason: "already_on_https_fallback",
    };
  }

  if (
    input.httpsFallbackLockedForFingerprint &&
    input.activeFingerprint &&
    input.httpsFallbackLockedForFingerprint === input.activeFingerprint
  ) {
    return {
      applyPreferDirectHttps: false,
      callHandlersOnError: true,
      lockHttpsFallback: false,
      reason: "https_fallback_locked_no_loop",
    };
  }

  const kind = input.sourceKind ?? "";
  if (kind === "data_url" || kind === "blob_url") {
    return {
      applyPreferDirectHttps: true,
      callHandlersOnError: false,
      lockHttpsFallback: true,
      reason: "data_or_blob_decode_failed_prefer_https",
    };
  }

  return {
    applyPreferDirectHttps: false,
    callHandlersOnError: true,
    lockHttpsFallback: false,
    reason: "https_or_other_error",
  };
}

/** Nouvelle Data URL iOS : déverrouiller HTTPS seulement si l’empreinte change (nouvelle photo). */
export function shouldUnlockPreferDirectHttps(input: {
  nextIosDataUrl: string | null | undefined;
  previousIosDataUrl: string | null;
  httpsFallbackLockedForFingerprint: string | null;
}): { unlock: boolean; nextPrevious: string | null; clearLock: boolean } {
  const next =
    typeof input.nextIosDataUrl === "string" && input.nextIosDataUrl.trim()
      ? input.nextIosDataUrl.trim()
      : null;
  if (!next) {
    return { unlock: false, nextPrevious: input.previousIosDataUrl, clearLock: false };
  }
  if (next === input.previousIosDataUrl) {
    return { unlock: false, nextPrevious: next, clearLock: false };
  }
  const nextFp = fingerprintProfileAvatarImgSrc(next);
  if (
    input.httpsFallbackLockedForFingerprint &&
    input.httpsFallbackLockedForFingerprint === nextFp
  ) {
    // Même contenu image → garder le verrou HTTPS (anti-boucle).
    return { unlock: false, nextPrevious: next, clearLock: false };
  }
  return { unlock: true, nextPrevious: next, clearLock: true };
}
