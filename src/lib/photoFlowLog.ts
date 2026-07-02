import { photoUrlPrefix } from "./profilePhotoPipelineLog";

/** SELECT readback diagnostic — toutes les colonnes photo canoniques + legacy. */
export const PHOTO_FLOW_READBACK_SELECT =
  "id, portrait_url, fullbody_url, main_photo_url, avatar_url, portrait_path, fullbody_path, activity_photo_path, photo2_path";

export type PhotoFlowFieldSnapshot = {
  portrait_url: string | null;
  fullbody_url: string | null;
  main_photo_url: string | null;
  avatar_url: string | null;
  portrait_path: string | null;
  photo2_path: string | null;
  activity_photo_path: string | null;
  fullbody_path: string | null;
};

const PHOTO_FIELD_KEYS = [
  "portrait_url",
  "fullbody_url",
  "main_photo_url",
  "avatar_url",
  "portrait_path",
  "photo2_path",
  "activity_photo_path",
  "fullbody_path",
] as const;

function pickPhotoField(row: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!row) return null;
  const v = row[key];
  return typeof v === "string" && v.trim() ? photoUrlPrefix(v.trim()) : null;
}

/** Snapshot des 8 champs photo pour logs [PhotoFlow] (URLs tronquées, sans token). */
export function photoFlowFieldsFromRow(
  row: Record<string, unknown> | null | undefined,
): PhotoFlowFieldSnapshot {
  const out = {} as PhotoFlowFieldSnapshot;
  for (const key of PHOTO_FIELD_KEYS) {
    out[key] = pickPhotoField(row, key);
  }
  return out;
}

function hasAnyPhotoField(fields: PhotoFlowFieldSnapshot): boolean {
  return PHOTO_FIELD_KEYS.some((k) => Boolean(fields[k]));
}

function basePayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...extra };
}

function log(event: string, payload: Record<string, unknown>): void {
  console.log(`[PhotoFlow] ${event}`, basePayload(payload));
}

/**
 * Logs structurés du flux photo SPLove — filtrer `[PhotoFlow]` dans Xcode Web Inspector.
 * Diagnostic iOS : upload → save → readback → résolution → placeholder.
 */
export const PhotoFlowLog = {
  /** 1. Photo locale sélectionnée (onboarding / edit). */
  localPhotoSelected(payload: {
    userId: string;
    slot: "portrait" | "activity";
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    localPreviewUrl?: string | null;
  }): void {
    log("local_photo_selected", {
      userId: payload.userId,
      slot: payload.slot,
      fileName: payload.fileName ?? null,
      fileSize: payload.fileSize ?? null,
      fileType: payload.fileType ?? null,
      hasLocalPreview: Boolean(payload.localPreviewUrl?.trim()),
      localPreviewKind: payload.localPreviewUrl?.startsWith("blob:")
        ? "blob"
        : payload.localPreviewUrl?.startsWith("data:")
          ? "data"
          : null,
    });
  },

  /** @deprecated alias — utiliser localPhotoSelected */
  fileSelected(payload: {
    userId: string;
    slot: "portrait" | "activity";
    fileName?: string;
    fileSize?: number;
    fileType?: string;
  }): void {
    PhotoFlowLog.localPhotoSelected(payload);
  },

  /** 1. Upload Storage lancé. */
  onboardingUploadStart(payload: {
    userId: string;
    slot: "portrait" | "activity";
    fileSize?: number;
    fileType?: string;
    objectPath?: string | null;
  }): void {
    log("upload_started", {
      userId: payload.userId,
      slot: payload.slot,
      fileSize: payload.fileSize ?? null,
      fileType: payload.fileType ?? null,
      objectPath: payload.objectPath ?? null,
    });
  },

  /** 1. URL publique / référence retournée par Supabase Storage après upload. */
  supabaseUrlReturned(payload: {
    userId: string;
    slot: "portrait" | "activity";
    storedRef: string;
    publicUrl?: string | null;
    displayUrl?: string | null;
    objectPath?: string | null;
    bucketReadableViaPublicUrl?: boolean | null;
  }): void {
    log("supabase_url_returned", {
      userId: payload.userId,
      slot: payload.slot,
      storedRef: photoUrlPrefix(payload.storedRef),
      publicUrl: photoUrlPrefix(payload.publicUrl ?? payload.storedRef),
      displayUrl: photoUrlPrefix(payload.displayUrl ?? null),
      objectPath: payload.objectPath ?? null,
      bucketReadableViaPublicUrl: payload.bucketReadableViaPublicUrl ?? null,
    });
  },

  /** 1. Upload réussi (fin de pipeline upload). */
  onboardingUploadSuccess(payload: {
    userId: string;
    slot: "portrait" | "activity";
    storedRef: string;
    displayUrl?: string | null;
  }): void {
    log("upload_success", {
      userId: payload.userId,
      slot: payload.slot,
      storedRef: photoUrlPrefix(payload.storedRef),
      displayUrl: photoUrlPrefix(payload.displayUrl ?? payload.storedRef),
    });
  },

  /** 1. Upload échoué. */
  uploadFailed(payload: {
    userId: string;
    slot: "portrait" | "activity";
    error: string;
    code?: string | number | null;
    objectPath?: string | null;
  }): void {
    log("upload_failed", {
      userId: payload.userId,
      slot: payload.slot,
      error: payload.error,
      code: payload.code ?? null,
      objectPath: payload.objectPath ?? null,
    });
  },

  uploadResult(payload: {
    userId: string;
    slot: "portrait" | "activity";
    ok: boolean;
    storedRef?: string | null;
    displayUrl?: string | null;
    error?: string | null;
  }): void {
    if (payload.ok) {
      log("upload_result", {
        userId: payload.userId,
        slot: payload.slot,
        ok: true,
        storedRef: photoUrlPrefix(payload.storedRef ?? null),
        displayUrl: photoUrlPrefix(payload.displayUrl ?? null),
      });
      return;
    }
    PhotoFlowLog.uploadFailed({
      userId: payload.userId,
      slot: payload.slot,
      error: payload.error ?? "unknown",
    });
  },

  /** 2. Payload exact (champs photo) envoyé en upsert/update profiles. */
  profileSavePayload(payload: {
    userId: string;
    source: string;
    operation?: "upsert" | "update";
    attempt?: number;
    payload: Record<string, unknown>;
    error?: string | null;
  }): void {
    const fields = photoFlowFieldsFromRow(payload.payload);
    log("profile_save_payload", {
      userId: payload.userId,
      source: payload.source,
      operation: payload.operation ?? "upsert",
      attempt: payload.attempt ?? 1,
      photoFields: fields,
      hasAnyPhotoField: hasAnyPhotoField(fields),
      payloadKeyCount: Object.keys(payload.payload).length,
      error: payload.error ?? null,
    });
  },

  /** @deprecated — utiliser profileSavePayload */
  profilePayloadSent(payload: {
    userId: string;
    source: string;
    portrait_url?: string | null;
    fullbody_url?: string | null;
    main_photo_url?: string | null;
    avatar_url?: string | null;
    portrait_path?: string | null;
    photo2_path?: string | null;
  }): void {
    PhotoFlowLog.profileSavePayload({
      userId: payload.userId,
      source: payload.source,
      payload: {
        portrait_url: payload.portrait_url,
        fullbody_url: payload.fullbody_url,
        main_photo_url: payload.main_photo_url,
        avatar_url: payload.avatar_url,
        portrait_path: payload.portrait_path,
        photo2_path: payload.photo2_path,
      },
    });
  },

  /** 3. Readback immédiat Supabase après écriture. */
  profileReadback(payload: {
    userId: string;
    source: string;
    row?: Record<string, unknown> | null;
    portrait_url?: string | null;
    fullbody_url?: string | null;
    main_photo_url?: string | null;
    avatar_url?: string | null;
    error?: string | null;
  }): void {
    const fields = payload.row
      ? photoFlowFieldsFromRow(payload.row)
      : {
          portrait_url: photoUrlPrefix(payload.portrait_url ?? null),
          fullbody_url: photoUrlPrefix(payload.fullbody_url ?? null),
          main_photo_url: photoUrlPrefix(payload.main_photo_url ?? null),
          avatar_url: photoUrlPrefix(payload.avatar_url ?? null),
          portrait_path: null,
          photo2_path: null,
          activity_photo_path: null,
          fullbody_path: null,
        };
    log("profile_readback", {
      userId: payload.userId,
      source: payload.source,
      photoFields: fields,
      hasAnyPhotoField: hasAnyPhotoField(fields as PhotoFlowFieldSnapshot),
      error: payload.error ?? null,
    });
  },

  savedToProfile(payload: {
    userId: string;
    profileId?: string | null;
    photoField: string;
    storedRef: string;
    main_photo_url?: string | null;
    portrait_url?: string | null;
  }): void {
    log("saved_to_profile", {
      userId: payload.userId,
      profileId: payload.profileId ?? payload.userId,
      photoField: payload.photoField,
      storedRef: photoUrlPrefix(payload.storedRef),
      main_photo_url: photoUrlPrefix(payload.main_photo_url ?? null),
      portrait_url: photoUrlPrefix(payload.portrait_url ?? null),
    });
  },

  /** 4. Ligne profil lue au chargement écran (Profil / EditProfile / Auth hydrate). */
  screenProfileRow(payload: {
    userId: string;
    screen: string;
    source: string;
    row: Record<string, unknown> | null | undefined;
    candidateRefs?: string[];
    error?: string | null;
  }): void {
    const fields = photoFlowFieldsFromRow(payload.row);
    log("screen_profile_row", {
      userId: payload.userId,
      screen: payload.screen,
      source: payload.source,
      photoFields: fields,
      hasAnyPhotoField: hasAnyPhotoField(fields),
      candidateRefCount: payload.candidateRefs?.length ?? 0,
      candidateRefs: (payload.candidateRefs ?? []).map((r) => photoUrlPrefix(r)),
      error: payload.error ?? null,
    });
  },

  /** 4. Tentative résolution URL (signed / public / sync). */
  urlResolveAttempt(payload: {
    screen: string;
    userId?: string | null;
    profileId?: string | null;
    photoField?: string | null;
    storedRef?: string | null;
    refIndex?: number;
    candidateCount?: number;
  }): void {
    log("url_resolve_attempt", {
      screen: payload.screen,
      userId: payload.userId ?? null,
      profileId: payload.profileId ?? null,
      photoField: payload.photoField ?? null,
      storedRef: photoUrlPrefix(payload.storedRef ?? null),
      refIndex: payload.refIndex ?? 0,
      candidateCount: payload.candidateCount ?? null,
    });
  },

  /** 4. URL résolue utilisable pour <img>. */
  profilePhotoResolved(payload: {
    userId?: string | null;
    profileId?: string | null;
    screen?: string;
    photoField?: string | null;
    storedRef?: string | null;
    displayUrl: string | null;
    resolveKind?: "signed" | "public" | "sync" | "blob" | "data" | "unknown";
    candidateIndex?: number;
    candidateCount?: number;
  }): void {
    const url = payload.displayUrl ?? "";
    let resolveKind = payload.resolveKind ?? "unknown";
    if (!payload.resolveKind) {
      if (url.startsWith("blob:")) resolveKind = "blob";
      else if (url.startsWith("data:")) resolveKind = "data";
      else if (url.includes("/object/sign/")) resolveKind = "signed";
      else if (url.includes("/object/public/")) resolveKind = "public";
    }
    log("url_resolved", {
      userId: payload.userId ?? null,
      profileId: payload.profileId ?? null,
      screen: payload.screen ?? "profile",
      photoField: payload.photoField ?? null,
      storedRef: photoUrlPrefix(payload.storedRef ?? null),
      displayUrl: photoUrlPrefix(payload.displayUrl),
      resolveKind,
      candidateIndex: payload.candidateIndex ?? 0,
      candidateCount: payload.candidateCount ?? null,
    });
  },

  discoverPhotoResolved(payload: {
    profileId?: string | null;
    photoField?: string | null;
    storedRef?: string | null;
    displayUrl: string | null;
    candidateIndex?: number;
    candidateCount?: number;
  }): void {
    PhotoFlowLog.profilePhotoResolved({
      profileId: payload.profileId,
      screen: "discover",
      photoField: payload.photoField,
      storedRef: payload.storedRef,
      displayUrl: payload.displayUrl,
      candidateIndex: payload.candidateIndex,
      candidateCount: payload.candidateCount,
    });
  },

  /** 4. Placeholder affiché — raison explicite pour le diagnostic. */
  placeholderShown(payload: {
    screen: string;
    slot: "primary" | "secondary" | "avatar";
    userId?: string | null;
    profileId?: string | null;
    reason:
      | "no_photo_refs_in_profile"
      | "resolving_urls"
      | "ios_capacitor_resolving"
      | "url_resolution_failed"
      | "no_display_src"
      | "ios_capacitor_failed"
      | "img_load_failed"
      | "secondary_loading"
      | "unknown";
    photoFields?: PhotoFlowFieldSnapshot | null;
    storedRef?: string | null;
    resolvedUrl?: string | null;
    extra?: Record<string, unknown>;
  }): void {
    log("placeholder_shown", {
      screen: payload.screen,
      slot: payload.slot,
      userId: payload.userId ?? null,
      profileId: payload.profileId ?? null,
      reason: payload.reason,
      photoFields: payload.photoFields ?? null,
      storedRef: photoUrlPrefix(payload.storedRef ?? null),
      resolvedUrl: photoUrlPrefix(payload.resolvedUrl ?? null),
      ...payload.extra,
    });
  },

  uiPhotoDecision(payload: {
    context: string;
    slot?: "primary" | "secondary";
    profileId?: string | null;
    main_photo_url?: string | null;
    portrait_url?: string | null;
    avatar_url?: string | null;
    fullbody_url?: string | null;
    face_photo_present?: boolean | null;
    activity_photo_present?: boolean | null;
    photo_status?: string | null;
    photo1_status?: string | null;
    photo2_status?: string | null;
    photo_moderation_overall?: string | null;
    displaySrc?: string | null;
  }): void {
    log("ui_photo_decision", {
      context: payload.context,
      slot: payload.slot ?? "primary",
      profileId: payload.profileId ?? null,
      main_photo_url: photoUrlPrefix(payload.main_photo_url ?? null),
      portrait_url: photoUrlPrefix(payload.portrait_url ?? null),
      avatar_url: photoUrlPrefix(payload.avatar_url ?? null),
      fullbody_url: photoUrlPrefix(payload.fullbody_url ?? null),
      face_photo_present: payload.face_photo_present ?? null,
      activity_photo_present: payload.activity_photo_present ?? null,
      photo_status: payload.photo_status ?? null,
      photo1_status: payload.photo1_status ?? null,
      photo2_status: payload.photo2_status ?? null,
      photo_moderation_overall: payload.photo_moderation_overall ?? null,
      displaySrc: photoUrlPrefix(payload.displaySrc ?? null),
      showingPhoto: Boolean(payload.displaySrc?.trim()),
    });
  },

  imageLoadError(payload: {
    context: string;
    profileId?: string | null;
    photoField?: string | null;
    storedRef?: string | null;
    displayUrl?: string | null;
    error?: string;
  }): void {
    log("image_load_error", {
      context: payload.context,
      profileId: payload.profileId ?? null,
      photoField: payload.photoField ?? null,
      storedRef: photoUrlPrefix(payload.storedRef ?? null),
      displayUrl: photoUrlPrefix(payload.displayUrl ?? null),
      error: payload.error ?? "img_onerror",
    });
  },

  noValidPhoto(payload: {
    context: string;
    userId?: string | null;
    profileId?: string | null;
    storedRef?: string | null;
    reason?: string;
  }): void {
    log("no_valid_photo", {
      context: payload.context,
      userId: payload.userId ?? null,
      profileId: payload.profileId ?? null,
      storedRef: photoUrlPrefix(payload.storedRef ?? null),
      reason: payload.reason ?? "unresolved",
    });
  },
};
