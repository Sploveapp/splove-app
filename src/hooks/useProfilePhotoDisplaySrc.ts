import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { normalizeProfilePhotoStoredRef } from "../lib/profilePhotoUpload";
import {
  getProfilePhotoSignedUrl,
  shouldPassThroughProfilePhotoDisplayUrl,
} from "../lib/profilePhotoSignedUrl";
import { photoUrlPrefix } from "../lib/profilePhotoPipelineLog";
import { PhotoFlowLog } from "../lib/photoFlowLog";
import {
  buildSyncProfilePhotoDisplayCandidates,
  buildSyncProfilePhotoDisplaySrc,
  pickPrimaryProfilePhotoStoredRef,
  pickSecondaryProfilePhotoStoredRef,
  skipSyncPublicProfilePhotoUrl,
} from "../lib/profilePhotoDisplayUrl";

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

/** main_photo_url → portrait_url → avatar_url (fullbody = slot secondaire uniquement) */
const PRIMARY_PHOTO_FIELD_ORDER: Array<keyof ProfilePhotoFields> = [
  "main_photo_url",
  "portrait_url",
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
  return buildSyncProfilePhotoDisplaySrc(ref);
}

/** Résolution ref BDD → URLs `<img>` (tests de non-régression iOS signed URL). */
export async function resolveProfilePhotoStoredRefDisplayUrls(storedRef: string): Promise<string[]> {
  const sync = buildSyncProfilePhotoDisplayCandidates(storedRef);
  const normalized = normalizeProfilePhotoStoredRef(storedRef, supabase);

  if (!normalized) {
    return sync;
  }

  // URL déjà affichable (avatar externe, blob, signed URL en BDD).
  if (shouldPassThroughProfilePhotoDisplayUrl(normalized)) {
    return sync.length > 0 ? sync : [normalized];
  }

  const out = [...sync];
  const seen = new Set(out);
  const push = (url: string | null | undefined) => {
    const t = typeof url === "string" ? url.trim() : "";
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  // iOS : sync vide (skipSyncPublic) — signed URL depuis la ref stockée (URL publique ou path).
  push(await getProfilePhotoSignedUrl(supabase, normalized));
  push(await getProfilePhotoSignedUrl(supabase, normalized, 3600));

  return out;
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
    emitConnectedPhotoLog(ctx, "field_try", {
      photoField: field,
      storedRef: photoUrlPrefix(ref),
    });
    const candidates = await resolveProfilePhotoStoredRefDisplayUrls(ref);
    if (candidates.length === 0) {
      emitConnectedPhotoLog(ctx, "field_no_display_url", {
        photoField: field,
        storedRef: photoUrlPrefix(ref),
        error: "no_public_or_signed_url",
      });
      return false;
    }
    setRefIndex(ri);
    setUrlCandidates(candidates);
    setUrlIndex(0);
    setIsLoading(false);
    setIsFailed(false);
    emitConnectedPhotoLog(ctx, "display_url_ready", {
      photoField: field,
      storedRef: photoUrlPrefix(ref),
      displayUrl: photoUrlPrefix(candidates[0] ?? null),
      candidateCount: candidates.length,
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
      return;
    }

    const firstStored = refs[0];
    const syncImmediate =
      firstStored && !skipSyncPublicProfilePhotoUrl(firstStored)
        ? buildSyncProfilePhotoDisplayCandidates(firstStored)
        : [];
    if (syncImmediate.length > 0) {
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
    if (syncImmediate.length === 0) {
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
    })();
  }, [refsKey, applyRef]);

  const activeRef = refs[refIndex] ?? refs[0] ?? null;
  const syncFallback = syncFallbackForRef(activeRef);
  const candidateSrc =
    urlCandidates.length > 0 ? (urlCandidates[urlIndex] ?? null) : null;
  const src = candidateSrc ?? syncFallback;

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
