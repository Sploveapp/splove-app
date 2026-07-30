import { shouldUseIosCapacitorImageFallback, isRemoteHttpImageUrl } from "./capacitorImageDataUrl";
import { photoUrlPrefix } from "./profilePhotoPipelineLog";

export function isSploveProfileStorageHttpUrl(url: string | null | undefined): boolean {
  const t = typeof url === "string" ? url.trim() : "";
  if (!t) return false;
  return t.includes("/profile-photos/") || (t.includes("/object/sign/") && t.includes("profile-photos"));
}

export type IosAwareProfilePhotoDisplayInput = {
  iosDisplaySrc: string | null | undefined;
  remoteBase: string | null | undefined;
  isResolving?: boolean;
  resolutionFailed?: boolean;
  usingDataUrl?: boolean;
};

/**
 * Src affichable : data/blob iOS si dispo, sinon URL HTTP(S) distante (y compris profile-photos).
 * Ne bloque plus les URLs publiques Storage pendant isResolving / resolutionFailed.
 */
export function resolveIosAwareProfilePhotoDisplaySrc(
  input: IosAwareProfilePhotoDisplayInput,
): string | null {
  const iosSrc =
    typeof input.iosDisplaySrc === "string" && input.iosDisplaySrc.trim()
      ? input.iosDisplaySrc.trim()
      : null;
  const remote =
    typeof input.remoteBase === "string" && input.remoteBase.trim()
      ? input.remoteBase.trim()
      : null;

  if (!shouldUseIosCapacitorImageFallback()) {
    return iosSrc ?? remote;
  }

  if (iosSrc) return iosSrc;
  if (remote && (remote.startsWith("http://") || remote.startsWith("https://"))) {
    return remote;
  }
  return null;
}

export function shouldShowProfilePhotoLoadingPlaceholder(input: {
  displaySrc: string | null;
  isLoading: boolean;
  isResolving: boolean;
}): boolean {
  if (input.displaySrc) return false;
  return input.isLoading || input.isResolving;
}

export function canMountProfilePhotoImg(
  displaySrc: string | null | undefined,
  _options: Pick<
    IosAwareProfilePhotoDisplayInput,
    "isResolving" | "resolutionFailed" | "usingDataUrl"
  > = {},
): boolean {
  const src = typeof displaySrc === "string" ? displaySrc.trim() : "";
  if (!src) return false;
  // Aligné sur resolveIosAwareProfilePhotoDisplaySrc : data/blob/http(s) montables,
  // y compris les URLs publiques profile-photos (plus de blocage mount).
  if (src.startsWith("data:") || src.startsWith("blob:")) return true;
  if (src.startsWith("http://") || src.startsWith("https://")) return true;
  if (!shouldUseIosCapacitorImageFallback()) return true;
  if (!isRemoteHttpImageUrl(src)) return true;
  return false;
}

/** URL HTTPS directe pour l’écran Mon profil (priorité = ordre des arguments). */
export function pickSelfProfileDirectHttpsSrc(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const t = typeof candidate === "string" ? candidate.trim() : "";
    if (t.startsWith("http://") || t.startsWith("https://")) return t;
  }
  return null;
}

export function extractIosDataOrBlobSrc(src: string | null | undefined): string | null {
  const t = typeof src === "string" ? src.trim() : "";
  if (t.startsWith("data:") || t.startsWith("blob:")) return t;
  return null;
}

export type SelfProfileUrlSourceKind =
  | "data_url"
  | "blob_url"
  | "public_https"
  | "signed_https"
  | "other_https"
  | "null";

/** Longueur minimale d’un token Storage signé utilisable (rejette `token=e`, etc.). */
export const MIN_PROFILE_PHOTO_SIGNED_TOKEN_LENGTH = 16;

export function isProfilePhotosSignedStorageUrl(url: string | null | undefined): boolean {
  const t = typeof url === "string" ? url.trim() : "";
  if (!t) return false;
  return t.includes("/object/sign/") && t.includes("/profile-photos/");
}

/**
 * Audit sans secret : longueur du token, jamais la valeur.
 * Rejette les signed URL avec token absent / trop court / manifestement invalide.
 */
export function auditSelfProfilePhotoUrl(url: string | null | undefined): {
  sourceKind: SelfProfileUrlSourceKind;
  urlLength: number | null;
  tokenPresent: boolean;
  tokenLength: number | null;
  validSignedUrl: boolean;
  pathname: string | null;
} {
  const t = typeof url === "string" ? url.trim() : "";
  if (!t) {
    return {
      sourceKind: "null",
      urlLength: null,
      tokenPresent: false,
      tokenLength: null,
      validSignedUrl: false,
      pathname: null,
    };
  }
  if (t.startsWith("data:")) {
    return {
      sourceKind: "data_url",
      urlLength: t.length,
      tokenPresent: false,
      tokenLength: null,
      validSignedUrl: false,
      pathname: null,
    };
  }
  if (t.startsWith("blob:")) {
    return {
      sourceKind: "blob_url",
      urlLength: t.length,
      tokenPresent: false,
      tokenLength: null,
      validSignedUrl: false,
      pathname: null,
    };
  }

  let pathname: string | null = null;
  let token: string | null = null;
  try {
    const parsed = new URL(t);
    pathname = parsed.pathname;
    token = parsed.searchParams.get("token");
  } catch {
    pathname = null;
    token = null;
  }

  const tokenPresent = Boolean(token);
  const tokenLength = token ? token.length : null;
  const isSigned = isProfilePhotosSignedStorageUrl(t);
  const isPublic = isSploveProfileStorageHttpUrl(t) && t.includes("/object/public/");

  let sourceKind: SelfProfileUrlSourceKind = "other_https";
  if (isSigned) sourceKind = "signed_https";
  else if (isPublic) sourceKind = "public_https";
  else if (t.startsWith("http://") || t.startsWith("https://")) sourceKind = "other_https";
  else sourceKind = "null";

  const endsWithTinyToken = /[?&]token=e$/i.test(t) || /[?&]token=[a-z0-9]{1,3}$/i.test(t);
  const validSignedUrl =
    isSigned &&
    tokenPresent &&
    typeof tokenLength === "number" &&
    tokenLength >= MIN_PROFILE_PHOTO_SIGNED_TOKEN_LENGTH &&
    !endsWithTinyToken;

  return {
    sourceKind,
    urlLength: t.length,
    tokenPresent,
    tokenLength,
    validSignedUrl,
    pathname,
  };
}

export function isAcceptableSelfProfileSignedUrl(url: string | null | undefined): boolean {
  return auditSelfProfilePhotoUrl(url).validSignedUrl;
}

export type SelfProfileAvatarSourceKind = SelfProfileUrlSourceKind;

/**
 * Décision d’affichage Mon profil :
 * 1) data/blob iOS si déjà résolu
 * 2) URL publique HTTPS (portrait → main → avatar)
 * 3) URL signée uniquement si token valide/complet
 * Ne jamais préférer une signed URL corrompue à une URL publique BDD.
 */
export function resolveSelfProfileAvatarImgSrc(input: {
  iosLayerDisplaySrc?: string | null;
  iosRawDisplaySrc?: string | null;
  /** Champs BDD / boot — priorité publique. */
  portraitUrl?: string | null;
  mainPhotoUrl?: string | null;
  avatarUrl?: string | null;
  /** Candidat hook (souvent signed) — dernier recours si token valide. */
  hookSrc?: string | null;
  preferDirectHttps?: boolean;
}): {
  src: string | null;
  sourceKind: SelfProfileAvatarSourceKind;
  hasIosDataUrl: boolean;
  hasDirectHttps: boolean;
  fallbackUsed: boolean;
  audit: ReturnType<typeof auditSelfProfilePhotoUrl>;
} {
  const ios =
    extractIosDataOrBlobSrc(input.iosLayerDisplaySrc) ??
    extractIosDataOrBlobSrc(input.iosRawDisplaySrc);
  const hasIosDataUrl = Boolean(ios);

  if (!input.preferDirectHttps && ios) {
    const audit = auditSelfProfilePhotoUrl(ios);
    return {
      src: ios,
      sourceKind: audit.sourceKind,
      hasIosDataUrl,
      hasDirectHttps: false,
      fallbackUsed: false,
      audit,
    };
  }

  const fieldCandidates = [input.portraitUrl, input.mainPhotoUrl, input.avatarUrl];
  for (const candidate of fieldCandidates) {
    const t = typeof candidate === "string" ? candidate.trim() : "";
    if (!t.startsWith("http://") && !t.startsWith("https://")) continue;
    const audit = auditSelfProfilePhotoUrl(t);
    if (audit.sourceKind === "public_https" || audit.sourceKind === "other_https") {
      return {
        src: t,
        sourceKind: audit.sourceKind,
        hasIosDataUrl,
        hasDirectHttps: true,
        fallbackUsed: false,
        audit,
      };
    }
  }

  // Signed valides : champs puis hook.
  for (const candidate of [...fieldCandidates, input.hookSrc]) {
    const t = typeof candidate === "string" ? candidate.trim() : "";
    if (!t) continue;
    const audit = auditSelfProfilePhotoUrl(t);
    if (audit.validSignedUrl) {
      return {
        src: t,
        sourceKind: "signed_https",
        hasIosDataUrl,
        hasDirectHttps: true,
        fallbackUsed: Boolean(
          fieldCandidates.some((c) => {
            const u = typeof c === "string" ? c.trim() : "";
            return u.startsWith("http") && auditSelfProfilePhotoUrl(u).sourceKind === "public_https";
          }),
        )
          ? false
          : Boolean(input.hookSrc && t === String(input.hookSrc).trim()),
        audit,
      };
    }
  }

  // Signed invalide + publique déjà testée → null (placeholder).
  const rejectedSigned = [...fieldCandidates, input.hookSrc].find((c) => {
    const t = typeof c === "string" ? c.trim() : "";
    return isProfilePhotosSignedStorageUrl(t) && !isAcceptableSelfProfileSignedUrl(t);
  });
  if (rejectedSigned) {
    const publicFallback = pickSelfProfileDirectHttpsSrc(
      ...fieldCandidates.filter((c) => {
        const t = typeof c === "string" ? c.trim() : "";
        return t.includes("/object/public/");
      }),
    );
    if (publicFallback) {
      const audit = auditSelfProfilePhotoUrl(publicFallback);
      return {
        src: publicFallback,
        sourceKind: audit.sourceKind,
        hasIosDataUrl,
        hasDirectHttps: true,
        fallbackUsed: true,
        audit,
      };
    }
  }

  const nullAudit = auditSelfProfilePhotoUrl(null);
  return {
    src: null,
    sourceKind: "null",
    hasIosDataUrl,
    hasDirectHttps: false,
    fallbackUsed: false,
    audit: nullAudit,
  };
}

export type ConnectedProfileAvatarDiagPayload = {
  userId?: string | null;
  storedRefs?: string[];
  activeRef?: string | null;
  activeField?: string | null;
  remoteBase?: string | null;
  iosDisplaySrc?: string | null;
  displaySrc?: string | null;
  stickySrc?: string | null;
  isLoading?: boolean;
  isFailed?: boolean;
  iosResolving?: boolean;
  iosResolutionFailed?: boolean;
  iosUsingDataUrl?: boolean;
  bootPhotoFields?: Record<string, string | null> | null;
  profileFields?: Record<string, string | null> | null;
  phase?: string;
  error?: string | null;
};

let lastDiagKey = "";

export function logConnectedProfileAvatarDiag(payload: ConnectedProfileAvatarDiagPayload): void {
  const key = [
    payload.phase ?? "",
    payload.userId ?? "",
    payload.activeRef ?? "",
    photoUrlPrefix(payload.displaySrc),
    String(payload.isLoading),
    String(payload.iosResolving),
    String(payload.isFailed),
    String(payload.iosResolutionFailed),
  ].join("|");
  if (key === lastDiagKey) return;
  lastDiagKey = key;

  console.log("[ConnectedProfileAvatar]", payload.phase ?? "state", {
    userId: payload.userId?.slice(0, 8) ?? null,
    storedRefs: payload.storedRefs?.map((r) => photoUrlPrefix(r)),
    activeRef: photoUrlPrefix(payload.activeRef),
    activeField: payload.activeField ?? null,
    remoteBase: photoUrlPrefix(payload.remoteBase),
    iosDisplaySrc: photoUrlPrefix(payload.iosDisplaySrc),
    displaySrc: photoUrlPrefix(payload.displaySrc),
    stickySrc: photoUrlPrefix(payload.stickySrc),
    isLoading: payload.isLoading ?? false,
    isFailed: payload.isFailed ?? false,
    iosResolving: payload.iosResolving ?? false,
    iosResolutionFailed: payload.iosResolutionFailed ?? false,
    iosUsingDataUrl: payload.iosUsingDataUrl ?? false,
    bootPhotoFields: payload.bootPhotoFields ?? null,
    profileFields: payload.profileFields ?? null,
    error: payload.error ?? null,
  });
}

export function resetConnectedProfileAvatarDiagDedup(): void {
  lastDiagKey = "";
}
