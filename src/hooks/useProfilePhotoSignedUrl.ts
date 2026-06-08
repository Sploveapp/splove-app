import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { PhotoFlowLog } from "../lib/photoFlowLog";
import { resolveProfilePhotoDisplayCandidates } from "../lib/profilePhotoUpload";
import {
  buildSyncProfilePhotoDisplaySrc,
  buildSyncProfilePhotoDisplayCandidates,
  skipSyncPublicProfilePhotoUrl,
} from "../lib/profilePhotoDisplayUrl";
import {
  DEFAULT_PROFILE_PHOTO_SIGNED_TTL_SEC,
  profilePhotoObjectPathFromStoredValue,
  shouldPassThroughProfilePhotoDisplayUrl,
} from "../lib/profilePhotoSignedUrl";

const failedRawRefs = new Set<string>();
const failedObjectPaths = new Set<string>();

export type ProfilePhotoSignedUrlOptions = {
  expiresInSec?: number;
  /** Retarde la résolution (Discover post-login). */
  deferMs?: number;
  /** Logs `[PhotoFlow] discover_photo_resolved` */
  discoverContext?: {
    profileId?: string | null;
    photoField?: string | null;
  };
};

function resolveOptions(
  expiresInSecOrOptions?: number | ProfilePhotoSignedUrlOptions,
): Required<Pick<ProfilePhotoSignedUrlOptions, "expiresInSec">> &
  Pick<ProfilePhotoSignedUrlOptions, "deferMs" | "discoverContext"> {
  if (typeof expiresInSecOrOptions === "number") {
    return { expiresInSec: expiresInSecOrOptions };
  }
  return {
    expiresInSec: expiresInSecOrOptions?.expiresInSec ?? DEFAULT_PROFILE_PHOTO_SIGNED_TTL_SEC,
    deferMs: expiresInSecOrOptions?.deferMs,
    discoverContext: expiresInSecOrOptions?.discoverContext,
  };
}

export type ProfilePhotoResolvedDisplay = {
  src: string | null;
  isLoading: boolean;
  onImageError: () => void;
};

/** Vide le cache d’échec — après onboarding ou changement de compte. */
export function clearProfilePhotoResolutionCache(): void {
  failedRawRefs.clear();
  failedObjectPaths.clear();
}

function useProfilePhotoResolvedInternal(
  raw: string | null | undefined,
  expiresInSecOrOptions?: number | ProfilePhotoSignedUrlOptions,
): ProfilePhotoResolvedDisplay {
  const { deferMs, discoverContext } = resolveOptions(expiresInSecOrOptions);
  const rawTrimmed = raw == null ? "" : String(raw).trim();

  const [candidates, setCandidates] = useState<string[]>([]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const candidatesRef = useRef<string[]>([]);
  const candidateIndexRef = useRef(0);
  const rawRef = useRef(rawTrimmed);
  rawRef.current = rawTrimmed;

  useEffect(() => {
    setCandidates([]);
    setCandidateIndex(0);
    setExhausted(false);
    candidatesRef.current = [];
    candidateIndexRef.current = 0;

    if (!rawTrimmed) {
      setIsLoading(false);
      if (discoverContext) {
        PhotoFlowLog.noValidPhoto({
          context: "useProfilePhotoSignedUrl",
          profileId: discoverContext.profileId,
          storedRef: null,
          reason: "empty_raw_ref",
        });
      }
      return;
    }

    if (shouldPassThroughProfilePhotoDisplayUrl(rawTrimmed)) {
      setCandidates([rawTrimmed]);
      candidatesRef.current = [rawTrimmed];
      setIsLoading(false);
      if (discoverContext) {
        PhotoFlowLog.discoverPhotoResolved({
          profileId: discoverContext.profileId,
          photoField: discoverContext.photoField,
          storedRef: rawTrimmed,
          displayUrl: rawTrimmed,
          candidateIndex: 0,
          candidateCount: 1,
        });
      }
      return;
    }

    const syncImmediate = skipSyncPublicProfilePhotoUrl(rawTrimmed)
      ? []
      : buildSyncProfilePhotoDisplayCandidates(rawTrimmed);
    if (syncImmediate.length > 0) {
      candidatesRef.current = syncImmediate;
      setCandidates(syncImmediate);
      setCandidateIndex(0);
      candidateIndexRef.current = 0;
      setIsLoading(false);
      setExhausted(false);
    }

    if (failedRawRefs.has(rawTrimmed)) {
      const cachedFallback = skipSyncPublicProfilePhotoUrl(rawTrimmed)
        ? null
        : buildSyncProfilePhotoDisplaySrc(rawTrimmed);
      if (cachedFallback) {
        candidatesRef.current = [cachedFallback];
        setCandidates([cachedFallback]);
        setCandidateIndex(0);
        candidateIndexRef.current = 0;
        setIsLoading(false);
        setExhausted(false);
        return;
      }
      setIsLoading(false);
      setExhausted(true);
      if (discoverContext) {
        PhotoFlowLog.noValidPhoto({
          context: "useProfilePhotoSignedUrl",
          profileId: discoverContext.profileId,
          storedRef: rawTrimmed,
          reason: "cached_resolution_failure",
        });
      }
      return;
    }

    const objectPath = profilePhotoObjectPathFromStoredValue(rawTrimmed);
    if (objectPath && failedObjectPaths.has(objectPath)) {
      const cachedFallback = skipSyncPublicProfilePhotoUrl(rawTrimmed)
        ? null
        : buildSyncProfilePhotoDisplaySrc(rawTrimmed);
      if (cachedFallback) {
        candidatesRef.current = [cachedFallback];
        setCandidates([cachedFallback]);
        setCandidateIndex(0);
        candidateIndexRef.current = 0;
        setIsLoading(false);
        setExhausted(false);
        return;
      }
      setIsLoading(false);
      setExhausted(true);
      if (discoverContext) {
        PhotoFlowLog.noValidPhoto({
          context: "useProfilePhotoSignedUrl",
          profileId: discoverContext.profileId,
          storedRef: rawTrimmed,
          reason: "cached_object_path_failure",
        });
      }
      return;
    }

    let cancelled = false;
    let deferTimer: ReturnType<typeof setTimeout> | undefined;
    if (syncImmediate.length === 0) {
      setIsLoading(true);
    }

    const runResolve = () => {
      void resolveProfilePhotoDisplayCandidates(supabase, rawTrimmed).then((resolved) => {
        if (cancelled) return;
        const merged = [...syncImmediate];
        const seen = new Set(merged);
        for (const url of resolved) {
          if (!seen.has(url)) {
            seen.add(url);
            merged.push(url);
          }
        }
        candidatesRef.current = merged.length > 0 ? merged : resolved;
        setCandidates(candidatesRef.current);
        setCandidateIndex(0);
        candidateIndexRef.current = 0;
        setIsLoading(false);
        if (candidatesRef.current.length === 0) {
          const fallback = skipSyncPublicProfilePhotoUrl(rawTrimmed)
            ? null
            : buildSyncProfilePhotoDisplaySrc(rawTrimmed);
          if (fallback) {
            candidatesRef.current = [fallback];
            setCandidates([fallback]);
            setExhausted(false);
            if (discoverContext) {
              PhotoFlowLog.discoverPhotoResolved({
                profileId: discoverContext.profileId,
                photoField: discoverContext.photoField,
                storedRef: rawTrimmed,
                displayUrl: fallback,
                candidateIndex: 0,
                candidateCount: 1,
              });
            }
            return;
          }
          failedRawRefs.add(rawTrimmed);
          if (objectPath) failedObjectPaths.add(objectPath);
          setExhausted(true);
          if (discoverContext) {
            PhotoFlowLog.noValidPhoto({
              context: "useProfilePhotoSignedUrl",
              profileId: discoverContext.profileId,
              storedRef: rawTrimmed,
              reason: "no_display_candidates",
            });
          }
          return;
        }
        if (discoverContext) {
          PhotoFlowLog.discoverPhotoResolved({
            profileId: discoverContext.profileId,
            photoField: discoverContext.photoField,
            storedRef: rawTrimmed,
            displayUrl: candidatesRef.current[0] ?? null,
            candidateIndex: 0,
            candidateCount: candidatesRef.current.length,
          });
        }
      });
    };

    if (deferMs != null && deferMs > 0) {
      deferTimer = setTimeout(runResolve, deferMs);
    } else {
      runResolve();
    }

    return () => {
      cancelled = true;
      if (deferTimer != null) clearTimeout(deferTimer);
    };
  }, [rawTrimmed, deferMs, discoverContext?.profileId, discoverContext?.photoField]);

  const onImageError = useCallback(() => {
    const storedRef = rawRef.current;
    const list = candidatesRef.current;
    const idx = candidateIndexRef.current;
    const failedUrl = list[idx] ?? null;

    PhotoFlowLog.imageLoadError({
      context: "useProfilePhotoSignedUrl",
      profileId: discoverContext?.profileId,
      photoField: discoverContext?.photoField,
      storedRef,
      displayUrl: failedUrl,
    });

    const next = idx + 1;
    if (next < list.length) {
      candidateIndexRef.current = next;
      setCandidateIndex(next);
      if (discoverContext) {
        PhotoFlowLog.discoverPhotoResolved({
          profileId: discoverContext.profileId,
          photoField: discoverContext.photoField,
          storedRef,
          displayUrl: list[next] ?? null,
          candidateIndex: next,
          candidateCount: list.length,
        });
      }
      return;
    }

    failedRawRefs.add(storedRef);
    const objectPath = profilePhotoObjectPathFromStoredValue(storedRef);
    if (objectPath) failedObjectPaths.add(objectPath);
    const fallback = skipSyncPublicProfilePhotoUrl(storedRef)
      ? null
      : buildSyncProfilePhotoDisplaySrc(storedRef);
    if (fallback) {
      candidatesRef.current = [fallback];
      setCandidates([fallback]);
      candidateIndexRef.current = 0;
      setCandidateIndex(0);
      setExhausted(false);
      if (discoverContext) {
        PhotoFlowLog.discoverPhotoResolved({
          profileId: discoverContext.profileId,
          photoField: discoverContext.photoField,
          storedRef,
          displayUrl: fallback,
          candidateIndex: 0,
          candidateCount: 1,
        });
      }
      return;
    }
    setExhausted(true);
    PhotoFlowLog.noValidPhoto({
      context: "useProfilePhotoSignedUrl",
      profileId: discoverContext?.profileId,
      storedRef,
      reason: "all_candidates_failed",
    });
  }, [discoverContext?.photoField, discoverContext?.profileId]);

  const resolvedSrc =
    candidates.length > 0 && !exhausted
      ? (candidates[candidateIndex] ?? null)
      : skipSyncPublicProfilePhotoUrl(rawTrimmed)
        ? null
        : buildSyncProfilePhotoDisplaySrc(rawTrimmed);

  return {
    src: resolvedSrc,
    isLoading,
    onImageError,
  };
}

/**
 * Résout une référence photo BDD → URL affichable (publique puis signée).
 * Préférer `useProfilePhotoResolvedDisplay` quand `<img onError>` est disponible.
 */
export function useProfilePhotoSignedUrl(
  raw: string | null | undefined,
  expiresInSecOrOptions?: number | ProfilePhotoSignedUrlOptions,
): string | null {
  return useProfilePhotoResolvedInternal(raw, expiresInSecOrOptions).src;
}

/** Résolution complète avec repli candidats + handler `onError` pour Discover. */
export function useProfilePhotoResolvedDisplay(
  raw: string | null | undefined,
  options?: ProfilePhotoSignedUrlOptions,
): ProfilePhotoResolvedDisplay {
  return useProfilePhotoResolvedInternal(raw, options);
}

/** Champ Supabase utilisé pour une URL stockée (ordre canonique app). */
export function resolveProfilePhotoFieldFromStoredRef(
  profile: {
    main_photo_url?: string | null;
    portrait_url?: string | null;
    fullbody_url?: string | null;
    avatar_url?: string | null;
  } | null | undefined,
  storedRef: string | null | undefined,
): string | null {
  if (!profile || !storedRef) return null;
  const ref = storedRef.trim();
  if (!ref) return null;
  const pairs: Array<[string, string | null | undefined]> = [
    ["main_photo_url", profile.main_photo_url],
    ["portrait_url", profile.portrait_url],
    ["avatar_url", profile.avatar_url],
    ["fullbody_url", profile.fullbody_url],
  ];
  for (const [field, value] of pairs) {
    if (typeof value === "string" && value.trim() === ref) return field;
  }
  if (profile.portrait_url?.trim()) return "portrait_url";
  if (profile.main_photo_url?.trim()) return "main_photo_url";
  if (profile.avatar_url?.trim()) return "avatar_url";
  return null;
}
