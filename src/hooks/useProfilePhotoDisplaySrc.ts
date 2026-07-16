import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { normalizeProfilePhotoStoredRef } from "../lib/profilePhotoUpload";
import {
  getProfilePhotoSignedUrl,
  shouldPassThroughProfilePhotoDisplayUrl,
  filterProfilePhotoDisplayUrls,
  profilePhotoObjectPathFromStoredValue,
  isProfilePhotosPublicStorageUrl,
} from "../lib/profilePhotoSignedUrl";
import { photoUrlPrefix } from "../lib/profilePhotoPipelineLog";
import { PhotoFlowLog } from "../lib/photoFlowLog";
import {
  buildSyncProfilePhotoDisplayCandidates,
  buildSyncProfilePhotoDisplaySrc,
  pickPrimaryProfilePhotoStoredRef,
  pickSecondaryProfilePhotoStoredRef,
  resolveProfilePhotoUiSrc,
  skipSyncPublicProfilePhotoUrl,
} from "../lib/profilePhotoDisplayUrl";
import { buildIosCapacitorImageFetchUrlCandidates } from "../lib/profilePhotoIosDisplayUrls";
import {
  canMountProfilePhotoImg,
  resolveIosAwareProfilePhotoDisplaySrc,
  shouldShowProfilePhotoLoadingPlaceholder,
} from "../lib/profilePhotoIosDisplay";
import { useIosCapacitorImageDisplay } from "./useIosCapacitorImageDisplay";

export type ProfilePhotoDisplayState = {
  src: string | null;
  isLoading: boolean;
  isFailed: boolean;
  activeRef: string | null;
  /** Colonne Supabase d’où provient activeRef (si logContext fourni). */
  activeField: string | null;
  urlIndex: number;
  onImageLoad: () => void;
  onImageError: () => void;
};

const LOG = "[profile-photo-display]";

export type PhotoDebugPhotoFields = {
  portrait_url?: string | null;
  avatar_url?: string | null;
  fullbody_url?: string | null;
  main_photo_url?: string | null;
};

/** Diagnostic production — préfixe [PHOTO_DEBUG], sans effet métier. */
export function classifyPhotoUrlForDebug(url: string | null | undefined): Record<string, unknown> {
  if (url == null) return { urlState: "null" };
  const t = url.trim();
  if (!t) return { urlState: "empty" };
  if (t.startsWith("data:")) return { urlState: "data_url", preview: photoUrlPrefix(t) };
  if (t.startsWith("blob:")) return { urlState: "blob_url" };
  try {
    const parsed = new URL(t);
    const path = parsed.pathname;
    const isSign = path.includes("/object/sign/") || parsed.searchParams.has("token");
    const isPublic = path.includes("/object/public/");
    let signedExpired: boolean | "unknown" = "unknown";
    const token = parsed.searchParams.get("token");
    if (token && token.includes(".")) {
      try {
        const payload = JSON.parse(
          atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        ) as { exp?: number };
        if (typeof payload.exp === "number") {
          signedExpired = payload.exp * 1000 < Date.now();
        }
      } catch {
        signedExpired = "unknown";
      }
    }
    return {
      urlState: isSign ? "signed_storage" : isPublic ? "public_storage" : "remote_https",
      host: parsed.host,
      signedExpired: isSign ? signedExpired : undefined,
      preview: photoUrlPrefix(t),
    };
  } catch {
    return { urlState: "invalid_url", preview: t.slice(0, 64) };
  }
}

export function logPhotoDebug(
  event: string,
  payload: {
    screen: string;
    userId?: string | null;
    profileId?: string | null;
    storedRef?: string | null;
    displaySrc?: string | null;
    photoFields?: PhotoDebugPhotoFields | null;
    isLoading?: boolean;
    isFailed?: boolean;
    error?: string | null;
    extra?: Record<string, unknown>;
  },
): void {
  const displaySrc = payload.displaySrc ?? null;
  const storedRef = payload.storedRef ?? null;
  console.log(`[PHOTO_DEBUG] ${event}`, {
    screen: payload.screen,
    userId: payload.userId ?? null,
    profileId: payload.profileId ?? null,
    portrait_url: photoUrlPrefix(payload.photoFields?.portrait_url ?? null),
    avatar_url: photoUrlPrefix(payload.photoFields?.avatar_url ?? null),
    fullbody_url: photoUrlPrefix(payload.photoFields?.fullbody_url ?? null),
    main_photo_url: photoUrlPrefix(payload.photoFields?.main_photo_url ?? null),
    storedRef: photoUrlPrefix(storedRef),
    imgSrc: photoUrlPrefix(displaySrc),
    ...classifyPhotoUrlForDebug(displaySrc),
    storedRefClass: classifyPhotoUrlForDebug(storedRef),
    isLoading: payload.isLoading ?? false,
    isFailed: payload.isFailed ?? false,
    error: payload.error ?? null,
    ...(payload.extra ?? {}),
  });
}

type ProfilePhotoFields = {
  main_photo_url?: string | null;
  portrait_url?: string | null;
  fullbody_url?: string | null;
  avatar_url?: string | null;
};

export type ConnectedProfilePhotoLogContext = {
  userId?: string | null;
  profileId?: string | null;
  source?: string;
  fieldByRef?: Record<string, string>;
};

type UseProfilePhotoDisplaySrcOptions = {
  logContext?: ConnectedProfilePhotoLogContext;
};

function logSelected(source: string): void {
  if (import.meta.env.DEV) console.log(LOG, "selected source", source.slice(0, 96));
}

function logOk(source: string): void {
  if (import.meta.env.DEV) console.log(LOG, "load ok", source.slice(0, 96));
}

function logError(source: string): void {
  if (import.meta.env.DEV) console.log(LOG, "load error", source.slice(0, 96));
}

const connectedPhotoLogDedup = new Set<string>();

function emitConnectedPhotoLog(
  ctx: ConnectedProfilePhotoLogContext | undefined,
  event: string,
  payload: Record<string, unknown>,
): void {
  if (!import.meta.env.DEV || !ctx) return;
  const storedRef =
    typeof payload.storedRef === "string" ? payload.storedRef : String(payload.storedRef ?? "");
  const dedupKey = `${ctx.source ?? "profile.screen"}|${event}|${storedRef}`;
  if (connectedPhotoLogDedup.has(dedupKey)) return;
  connectedPhotoLogDedup.add(dedupKey);
  console.log(`[SPLovePhoto][connected-profile] ${event}`, {
    userId: ctx.userId ?? null,
    profileId: ctx.profileId ?? null,
    source: ctx.source ?? "profile.screen",
    ...payload,
  });
}

function fieldForRef(
  ctx: ConnectedProfilePhotoLogContext | undefined,
  ref: string | null | undefined,
): string | null {
  if (!ctx?.fieldByRef || !ref) return null;
  return ctx.fieldByRef[ref] ?? null;
}

function normalizeRefs(input: string | string[] | null | undefined): string[] {
  const list = Array.isArray(input) ? input : input ? [input] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const t = typeof item === "string" ? item.trim() : "";
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function collectOrderedRefs(
  profile: ProfilePhotoFields | null | undefined,
  order: Array<keyof ProfilePhotoFields>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of order) {
    const value = profile?.[key];
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** portrait_url → main_photo_url → avatar_url (fullbody = slot secondaire uniquement) */
const PRIMARY_PHOTO_FIELD_ORDER: Array<keyof ProfilePhotoFields> = [
  "portrait_url",
  "main_photo_url",
  "avatar_url",
];

export function primaryProfilePhotoRefCandidates(
  profile: ProfilePhotoFields | null | undefined,
): { refs: string[]; fieldByRef: Record<string, string> } {
  const refs = collectOrderedRefs(profile, PRIMARY_PHOTO_FIELD_ORDER);
  const fieldByRef: Record<string, string> = {};
  for (const key of PRIMARY_PHOTO_FIELD_ORDER) {
    const value = profile?.[key];
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) fieldByRef[trimmed] = key;
  }
  return { refs, fieldByRef };
}

/** main_photo_url → portrait_url → avatar_url */
export function primaryProfilePhotoRefs(profile: ProfilePhotoFields | null | undefined): string[] {
  const primary = pickPrimaryProfilePhotoStoredRef(profile);
  return primary ? [primary] : [];
}

/** fullbody_url uniquement */
export function secondaryProfilePhotoRefs(profile: ProfilePhotoFields | null | undefined): string[] {
  const secondary = pickSecondaryProfilePhotoStoredRef(profile);
  return secondary ? [secondary] : [];
}

function syncFallbackForRef(ref: string | null | undefined): string | null {
  if (!ref || skipSyncPublicProfilePhotoUrl(ref)) return null;
  const fallback = buildSyncProfilePhotoDisplaySrc(ref);
  if (!fallback || isProfilePhotosPublicStorageUrl(fallback)) return null;
  return fallback;
}

/** Résolution ref BDD → URLs `<img>` (signed URL en premier — bucket privé). */
export async function resolveProfilePhotoStoredRefDisplayUrls(storedRef: string): Promise<string[]> {
  const raw = typeof storedRef === "string" ? storedRef.trim() : "";
  if (!raw) return [];

  const normalized = normalizeProfilePhotoStoredRef(raw, supabase);
  if (!normalized) return [];

  if (shouldPassThroughProfilePhotoDisplayUrl(normalized)) {
    return filterProfilePhotoDisplayUrls([normalized]);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (url: string | null | undefined) => {
    const t = typeof url === "string" ? url.trim() : "";
    if (!t || seen.has(t) || isProfilePhotosPublicStorageUrl(t)) return;
    seen.add(t);
    out.push(t);
  };

  push(await getProfilePhotoSignedUrl(supabase, raw));
  push(await getProfilePhotoSignedUrl(supabase, raw, 3600));
  if (normalized !== raw) {
    push(await getProfilePhotoSignedUrl(supabase, normalized));
  }

  const filtered = filterProfilePhotoDisplayUrls(out);
  if (filtered.length > 0) return filtered;

  // Dernier recours : URL HTTP(S) déjà en BDD (évite fallback SPLove / no_candidates).
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    console.log("[PROFILE_PHOTO_FIX] direct_url_used", { field: "stored_ref" });
    console.log("[PROFILE_PHOTO_FIX] preview_ready", { sourceKind: "direct_https" });
    return [raw];
  }

  return [];
}

/**
 * Affiche une photo profil : essaie chaque champ BDD (dans l’ordre fourni),
 * puis pour chaque champ public → signée. Jamais d’`<img>` sans src valide.
 */
export function useProfilePhotoDisplaySrc(
  refsInput: string | string[] | null | undefined,
  options: UseProfilePhotoDisplaySrcOptions = {},
): ProfilePhotoDisplayState {
  const logContext = options.logContext;
  const logContextRef = useRef(logContext);
  logContextRef.current = logContext;

  const refsKey = useMemo(() => normalizeRefs(refsInput).join("\0"), [
    Array.isArray(refsInput) ? refsInput.join("\0") : refsInput ?? "",
  ]);
  const refs = useMemo(
    () => (refsKey ? refsKey.split("\0") : []),
    [refsKey],
  );

  const [refIndex, setRefIndex] = useState(0);
  const [urlCandidates, setUrlCandidates] = useState<string[]>([]);
  const [urlIndex, setUrlIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isFailed, setIsFailed] = useState(false);

  const genRef = useRef(0);
  const refsRef = useRef(refs);
  refsRef.current = refs;

  const applyRef = useCallback(async (ref: string, ri: number): Promise<boolean> => {
    const ctx = logContextRef.current;
    const field = fieldForRef(ctx, ref);
    logSelected(ref);
    PhotoFlowLog.urlResolveAttempt({
      screen: ctx?.source ?? "profile.screen",
      userId: ctx?.userId,
      profileId: ctx?.profileId,
      photoField: field,
      storedRef: ref,
      refIndex: ri,
      candidateCount: refsRef.current.length,
    });
    const candidates = await resolveProfilePhotoStoredRefDisplayUrls(ref);
    const objectPath =
      profilePhotoObjectPathFromStoredValue(ref) ??
      profilePhotoObjectPathFromStoredValue(normalizeProfilePhotoStoredRef(ref, supabase));
    logPhotoDebug("signed_url_ready", {
      screen: ctx?.source ?? "profile.screen",
      userId: ctx?.userId,
      profileId: ctx?.profileId,
      storedRef: ref,
      isLoading: false,
      isFailed: false,
      extra: {
        objectPath,
        signedUrlPresent: candidates.length > 0,
        firstCandidate: candidates[0] ?? null,
      },
    });
    if (candidates.length === 0) {
      PhotoFlowLog.noValidPhoto({
        context: ctx?.source ?? "profile.screen",
        userId: ctx?.userId,
        profileId: ctx?.profileId,
        storedRef: ref,
        reason: "no_public_or_signed_url",
      });
      return false;
    }
    setRefIndex(ri);
    setUrlCandidates(candidates);
    setUrlIndex(0);
    setIsLoading(false);
    setIsFailed(false);
    PhotoFlowLog.profilePhotoResolved({
      userId: ctx?.userId,
      profileId: ctx?.profileId,
      screen: ctx?.source ?? "profile.screen",
      photoField: field,
      storedRef: ref,
      displayUrl: candidates[0] ?? null,
      candidateIndex: 0,
      candidateCount: candidates.length,
    });
    logPhotoDebug("display_url_ready", {
      screen: ctx?.source ?? "profile.screen",
      userId: ctx?.userId,
      profileId: ctx?.profileId,
      storedRef: ref,
      displaySrc: candidates[0] ?? null,
      isLoading: false,
      isFailed: false,
      extra: { candidateCount: candidates.length, signedUrl: true },
    });
    return true;
  }, []);

  useEffect(() => {
    setRefIndex(0);
    setUrlCandidates([]);
    setUrlIndex(0);
    setIsFailed(false);

    const ctx = logContextRef.current;
    emitConnectedPhotoLog(ctx, "resolve_start", {
      candidateFields: refs.map((ref) => fieldForRef(ctx, ref)).filter(Boolean),
      candidateCount: refs.length,
    });

    if (refs.length === 0) {
      setIsLoading(false);
      emitConnectedPhotoLog(ctx, "resolve_empty", {
        error: "no_photo_refs_in_profile",
      });
      logPhotoDebug("resolve_empty", {
        screen: ctx?.source ?? "profile.screen",
        userId: ctx?.userId,
        profileId: ctx?.profileId,
        isLoading: false,
        isFailed: false,
        error: "no_photo_refs_in_profile",
      });
      return;
    }

    const firstStored = refs[0];
    const syncImmediate =
      firstStored && !skipSyncPublicProfilePhotoUrl(firstStored)
        ? filterProfilePhotoDisplayUrls(buildSyncProfilePhotoDisplayCandidates(firstStored))
        : [];
    // URL HTTP(S) déjà en BDD : affichage immédiat (évite fallback pendant la résolution signée).
    if (
      syncImmediate.length === 0 &&
      firstStored &&
      (firstStored.startsWith("http://") || firstStored.startsWith("https://"))
    ) {
      console.log("[PROFILE_PHOTO_FIX] direct_url_used", {
        field: fieldForRef(ctx, firstStored) ?? "stored_ref",
      });
      console.log("[PROFILE_PHOTO_FIX] preview_ready", { sourceKind: "direct_https" });
      setRefIndex(0);
      setUrlCandidates([firstStored]);
      setUrlIndex(0);
      setIsLoading(true);
      setIsFailed(false);
    } else if (syncImmediate.length > 0) {
      setRefIndex(0);
      setUrlCandidates(syncImmediate);
      setUrlIndex(0);
      setIsLoading(false);
      setIsFailed(false);
      emitConnectedPhotoLog(ctx, "display_url_ready", {
        photoField: fieldForRef(ctx, firstStored),
        storedRef: photoUrlPrefix(firstStored),
        displayUrl: photoUrlPrefix(syncImmediate[0] ?? null),
        candidateCount: syncImmediate.length,
        syncImmediate: true,
      });
      logPhotoDebug("display_url_ready", {
        screen: ctx?.source ?? "profile.screen",
        userId: ctx?.userId,
        profileId: ctx?.profileId,
        storedRef: firstStored,
        displaySrc: syncImmediate[0] ?? null,
        isLoading: false,
        isFailed: false,
        extra: { syncImmediate: true, candidateCount: syncImmediate.length },
      });
    }

    const local = refs.find((r) => r.startsWith("blob:") || r.startsWith("data:"));
    if (local) {
      logSelected(local);
      setUrlCandidates([local]);
      setUrlIndex(0);
      setIsLoading(false);
      emitConnectedPhotoLog(ctx, "display_url_ready", {
        photoField: fieldForRef(ctx, local),
        storedRef: photoUrlPrefix(local),
        displayUrl: photoUrlPrefix(local),
        candidateCount: 1,
      });
      return;
    }

    const gen = ++genRef.current;
    const hasDirectHttpsSticky =
      syncImmediate.length === 0 &&
      Boolean(firstStored) &&
      (firstStored.startsWith("http://") || firstStored.startsWith("https://"));
    if (syncImmediate.length === 0 && !hasDirectHttpsSticky) {
      setIsLoading(true);
      setUrlCandidates([]);
    }

    void (async () => {
      for (let i = 0; i < refs.length; i += 1) {
        const ok = await applyRef(refs[i], i);
        if (genRef.current !== gen) return;
        if (ok) return;
        logError(refs[i]);
        emitConnectedPhotoLog(ctx, "field_failed", {
          photoField: fieldForRef(ctx, refs[i]),
          storedRef: photoUrlPrefix(refs[i]),
          error: "url_resolution_failed",
        });
      }
      if (genRef.current !== gen) return;
      const fallback = syncFallbackForRef(refs[0]);
      if (fallback) {
        setRefIndex(0);
        setUrlCandidates([fallback]);
        setUrlIndex(0);
        setIsLoading(false);
        setIsFailed(false);
        emitConnectedPhotoLog(ctx, "display_url_ready", {
          photoField: fieldForRef(ctx, refs[0]),
          storedRef: photoUrlPrefix(refs[0]),
          displayUrl: photoUrlPrefix(fallback),
          candidateCount: 1,
          syncFallback: true,
        });
        return;
      }
      setIsLoading(false);
      setIsFailed(true);
      emitConnectedPhotoLog(ctx, "resolve_failed", {
        error: "all_photo_fields_failed",
        candidateCount: refs.length,
      });
      logPhotoDebug("resolve_failed", {
        screen: ctx?.source ?? "profile.screen",
        userId: ctx?.userId,
        profileId: ctx?.profileId,
        isLoading: false,
        isFailed: true,
        error: "all_photo_fields_failed",
        extra: { candidateCount: refs.length },
      });
    })();
  }, [refsKey, applyRef]);

  const activeRef = refs[refIndex] ?? refs[0] ?? null;
  const syncFallback = syncFallbackForRef(activeRef);
  const candidateSrc =
    urlCandidates.length > 0 ? (urlCandidates[urlIndex] ?? null) : null;
  const src =
    candidateSrc && !isProfilePhotosPublicStorageUrl(candidateSrc)
      ? candidateSrc
      : syncFallback && !isProfilePhotosPublicStorageUrl(syncFallback)
        ? syncFallback
        : null;

  const activeField = fieldForRef(logContext, activeRef);

  const advance = useCallback(() => {
    const ctx = logContextRef.current;
    const currentSrc = urlCandidates[urlIndex] ?? activeRef ?? "";
    logError(currentSrc || activeRef || "unknown");
    emitConnectedPhotoLog(ctx, "image_load_error", {
      photoField: fieldForRef(ctx, activeRef),
      storedRef: photoUrlPrefix(activeRef),
      displayUrl: photoUrlPrefix(currentSrc),
      urlIndex,
      error: "img_onerror",
    });
    logPhotoDebug("img_onerror", {
      screen: ctx?.source ?? "profile.screen",
      userId: ctx?.userId,
      profileId: ctx?.profileId,
      storedRef: activeRef,
      displaySrc: currentSrc || null,
      isLoading,
      isFailed,
      error: "img_onerror",
      extra: { urlIndex, candidateCount: urlCandidates.length },
    });
    if (ctx) {
      PhotoFlowLog.imageLoadError({
        context: "profile.screen",
        profileId: ctx.profileId,
        photoField: fieldForRef(ctx, activeRef),
        storedRef: photoUrlPrefix(activeRef),
        displayUrl: photoUrlPrefix(currentSrc),
      });
    }

    if (urlIndex < urlCandidates.length - 1) {
      setUrlIndex((i) => i + 1);
      return;
    }

    const nextRef = refIndex + 1;
    if (nextRef >= refsRef.current.length) {
      const fallback = syncFallbackForRef(activeRef ?? refsRef.current[0]);
      if (fallback) {
        setUrlCandidates([fallback]);
        setUrlIndex(0);
        setIsFailed(false);
        setIsLoading(false);
        emitConnectedPhotoLog(ctx, "display_url_ready", {
          photoField: fieldForRef(ctx, activeRef),
          storedRef: photoUrlPrefix(activeRef),
          displayUrl: photoUrlPrefix(fallback),
          candidateCount: 1,
          syncFallback: true,
        });
        return;
      }
      setIsFailed(true);
      setUrlCandidates([]);
      emitConnectedPhotoLog(ctx, "resolve_failed", {
        error: "all_candidates_exhausted",
        candidateCount: refsRef.current.length,
      });
      if (ctx) {
        PhotoFlowLog.noValidPhoto({
          context: "profile.screen",
          userId: ctx.userId,
          profileId: ctx.profileId,
          storedRef: photoUrlPrefix(activeRef),
          reason: "all_candidates_exhausted",
        });
      }
      return;
    }

    setIsLoading(true);
    setUrlCandidates([]);
    setUrlIndex(0);

    void (async () => {
      for (let i = nextRef; i < refsRef.current.length; i += 1) {
        const ok = await applyRef(refsRef.current[i], i);
        if (ok) return;
        logError(refsRef.current[i]);
        emitConnectedPhotoLog(ctx, "field_failed", {
          photoField: fieldForRef(ctx, refsRef.current[i]),
          storedRef: photoUrlPrefix(refsRef.current[i]),
          error: "url_resolution_failed",
        });
      }
      setIsLoading(false);
      setIsFailed(true);
      emitConnectedPhotoLog(ctx, "resolve_failed", {
        error: "all_photo_fields_failed",
        candidateCount: refsRef.current.length,
      });
    })();
  }, [activeRef, applyRef, refIndex, urlCandidates, urlIndex]);

  const onImageLoad = useCallback(() => {
    const ctx = logContextRef.current;
    const loadedUrl = urlCandidates[urlIndex] ?? activeRef ?? "";
    logOk(loadedUrl);
    emitConnectedPhotoLog(ctx, "image_load_ok", {
      photoField: fieldForRef(ctx, activeRef),
      storedRef: photoUrlPrefix(activeRef),
      displayUrl: photoUrlPrefix(loadedUrl),
      urlIndex,
    });
    logPhotoDebug("img_onload", {
      screen: ctx?.source ?? "profile.screen",
      userId: ctx?.userId,
      profileId: ctx?.profileId,
      storedRef: activeRef,
      displaySrc: loadedUrl || null,
      isLoading,
      isFailed,
      extra: { urlIndex },
    });
    if (ctx) {
      PhotoFlowLog.profilePhotoResolved({
        userId: ctx.userId,
        profileId: ctx.profileId,
        photoField: fieldForRef(ctx, activeRef),
        storedRef: photoUrlPrefix(activeRef),
        displayUrl: photoUrlPrefix(loadedUrl),
      });
    }
  }, [activeRef, urlCandidates, urlIndex]);

  const onImageError = useCallback(() => {
    advance();
  }, [advance]);

  useEffect(() => {
    const ctx = logContextRef.current;
    logPhotoDebug("hook.state", {
      screen: ctx?.source ?? "profile.screen",
      userId: ctx?.userId,
      profileId: ctx?.profileId,
      storedRef: activeRef,
      displaySrc: src,
      isLoading,
      isFailed,
      extra: {
        urlIndex,
        refIndex,
        candidateCount: urlCandidates.length,
        mountBlocked: !src && !isLoading && refs.length > 0,
      },
    });
  }, [src, isLoading, isFailed, activeRef, urlIndex, refIndex, urlCandidates.length, refs.length]);

  return {
    src,
    isLoading,
    isFailed,
    activeRef,
    activeField,
    urlIndex,
    onImageLoad,
    onImageError,
  };
}

export type ProfilePhotoIosDisplayLayerOptions = {
  /** Désactive CapacitorHttp (preview blob local). */
  disableIosFetch?: boolean;
  /** Src distante explicite (ex. blob preview). */
  remoteBaseOverride?: string | null;
};

/**
 * Couche iOS : n’expose jamais une URL Storage HTTPS dans `<img>` —
 * attend la data URL CapacitorHttp ou une URL non-Storage (OAuth).
 */
export function useProfilePhotoIosDisplayLayer(
  photo: ProfilePhotoDisplayState,
  storedRef: string | null,
  options: ProfilePhotoIosDisplayLayerOptions = {},
) {
  const resolvedSrc = resolveProfilePhotoUiSrc(storedRef, photo.src);
  const remoteBase = options.disableIosFetch
    ? (options.remoteBaseOverride ?? null)
    : photo.isFailed && !photo.src
      ? null
      : (options.remoteBaseOverride ?? resolvedSrc);

  const iosFetchUrls = useMemo(
    () => buildIosCapacitorImageFetchUrlCandidates(storedRef, remoteBase),
    [storedRef, remoteBase],
  );

  const ios = useIosCapacitorImageDisplay(options.disableIosFetch ? null : remoteBase, {
    fallbackUrls: iosFetchUrls.filter((u) => u !== remoteBase),
  });

  const displaySrc = options.disableIosFetch
    ? (options.remoteBaseOverride ?? resolvedSrc)
    : resolveIosAwareProfilePhotoDisplaySrc({
        iosDisplaySrc: ios.displaySrc,
        remoteBase,
        isResolving: ios.isResolving,
        resolutionFailed: ios.resolutionFailed,
        usingDataUrl: ios.usingDataUrl,
      });

  const mountImg = canMountProfilePhotoImg(displaySrc, {
    isResolving: options.disableIosFetch ? false : ios.isResolving,
    resolutionFailed: options.disableIosFetch ? false : ios.resolutionFailed,
    usingDataUrl: options.disableIosFetch ? false : ios.usingDataUrl,
  });

  const showLoadingPlaceholder = shouldShowProfilePhotoLoadingPlaceholder({
    displaySrc,
    isLoading: photo.isLoading,
    isResolving: options.disableIosFetch ? false : ios.isResolving,
  });

  return {
    displaySrc,
    mountImg,
    showLoadingPlaceholder,
    ios,
    remoteBase,
    resolvedSrc,
  };
}
