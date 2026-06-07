import { photoUrlPrefix } from "./profilePhotoPipelineLog";

function basePayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...extra };
}

/** Logs structurés du flux photo SPLove — filtrables `[PhotoFlow]` dans Xcode / Safari. */
export const PhotoFlowLog = {
  fileSelected(payload: {
    userId: string;
    slot: "portrait" | "activity";
    fileName?: string;
    fileSize?: number;
    fileType?: string;
  }): void {
    console.log(
      "[PhotoFlow] file_selected",
      basePayload({
        userId: payload.userId,
        slot: payload.slot,
        fileName: payload.fileName ?? null,
        fileSize: payload.fileSize ?? null,
        fileType: payload.fileType ?? null,
      }),
    );
  },

  onboardingUploadStart(payload: {
    userId: string;
    slot: "portrait" | "activity";
    fileSize?: number;
    fileType?: string;
  }): void {
    console.log(
      "[PhotoFlow] onboarding_upload_start",
      basePayload({
        userId: payload.userId,
        slot: payload.slot,
        fileSize: payload.fileSize ?? null,
        fileType: payload.fileType ?? null,
      }),
    );
  },

  onboardingUploadSuccess(payload: {
    userId: string;
    slot: "portrait" | "activity";
    storedRef: string;
    displayUrl?: string | null;
  }): void {
    console.log(
      "[PhotoFlow] onboarding_upload_success",
      basePayload({
        userId: payload.userId,
        slot: payload.slot,
        storedRef: photoUrlPrefix(payload.storedRef),
        displayUrl: photoUrlPrefix(payload.displayUrl ?? payload.storedRef),
      }),
    );
  },

  uploadResult(payload: {
    userId: string;
    slot: "portrait" | "activity";
    ok: boolean;
    storedRef?: string | null;
    displayUrl?: string | null;
    error?: string | null;
  }): void {
    console.log(
      "[PhotoFlow] upload_result",
      basePayload({
        userId: payload.userId,
        slot: payload.slot,
        ok: payload.ok,
        storedRef: photoUrlPrefix(payload.storedRef ?? null),
        displayUrl: photoUrlPrefix(payload.displayUrl ?? null),
        error: payload.error ?? null,
      }),
    );
  },

  profilePayloadSent(payload: {
    userId: string;
    source: string;
    portrait_url?: string | null;
    fullbody_url?: string | null;
    main_photo_url?: string | null;
    avatar_url?: string | null;
  }): void {
    console.log(
      "[PhotoFlow] profile_payload_sent",
      basePayload({
        userId: payload.userId,
        source: payload.source,
        portrait_url: photoUrlPrefix(payload.portrait_url ?? null),
        fullbody_url: photoUrlPrefix(payload.fullbody_url ?? null),
        main_photo_url: photoUrlPrefix(payload.main_photo_url ?? null),
        avatar_url: photoUrlPrefix(payload.avatar_url ?? null),
      }),
    );
  },

  profileReadback(payload: {
    userId: string;
    source: string;
    portrait_url?: string | null;
    fullbody_url?: string | null;
    main_photo_url?: string | null;
    avatar_url?: string | null;
    error?: string | null;
  }): void {
    console.log(
      "[PhotoFlow] profile_readback",
      basePayload({
        userId: payload.userId,
        source: payload.source,
        portrait_url: photoUrlPrefix(payload.portrait_url ?? null),
        fullbody_url: photoUrlPrefix(payload.fullbody_url ?? null),
        main_photo_url: photoUrlPrefix(payload.main_photo_url ?? null),
        avatar_url: photoUrlPrefix(payload.avatar_url ?? null),
        error: payload.error ?? null,
      }),
    );
  },

  savedToProfile(payload: {
    userId: string;
    profileId?: string | null;
    photoField: string;
    storedRef: string;
    main_photo_url?: string | null;
    portrait_url?: string | null;
  }): void {
    console.log(
      "[PhotoFlow] saved_to_profile",
      basePayload({
        userId: payload.userId,
        profileId: payload.profileId ?? payload.userId,
        photoField: payload.photoField,
        storedRef: photoUrlPrefix(payload.storedRef),
        main_photo_url: photoUrlPrefix(payload.main_photo_url ?? null),
        portrait_url: photoUrlPrefix(payload.portrait_url ?? null),
      }),
    );
  },

  discoverPhotoResolved(payload: {
    profileId?: string | null;
    photoField?: string | null;
    storedRef?: string | null;
    displayUrl: string | null;
    candidateIndex?: number;
    candidateCount?: number;
  }): void {
    console.log(
      "[PhotoFlow] discover_photo_resolved",
      basePayload({
        profileId: payload.profileId ?? null,
        photoField: payload.photoField ?? null,
        storedRef: photoUrlPrefix(payload.storedRef ?? null),
        displayUrl: photoUrlPrefix(payload.displayUrl),
        candidateIndex: payload.candidateIndex ?? 0,
        candidateCount: payload.candidateCount ?? null,
      }),
    );
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
    console.log(
      "[PhotoFlow] ui_photo_decision",
      basePayload({
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
      }),
    );
  },

  profilePhotoResolved(payload: {
    userId?: string | null;
    profileId?: string | null;
    photoField?: string | null;
    storedRef?: string | null;
    displayUrl: string | null;
  }): void {
    console.log(
      "[PhotoFlow] profile_photo_resolved",
      basePayload({
        userId: payload.userId ?? null,
        profileId: payload.profileId ?? null,
        photoField: payload.photoField ?? null,
        storedRef: photoUrlPrefix(payload.storedRef ?? null),
        displayUrl: photoUrlPrefix(payload.displayUrl),
      }),
    );
  },

  imageLoadError(payload: {
    context: string;
    profileId?: string | null;
    photoField?: string | null;
    storedRef?: string | null;
    displayUrl?: string | null;
    error?: string;
  }): void {
    console.log(
      "[PhotoFlow] image_load_error",
      basePayload({
        context: payload.context,
        profileId: payload.profileId ?? null,
        photoField: payload.photoField ?? null,
        storedRef: photoUrlPrefix(payload.storedRef ?? null),
        displayUrl: photoUrlPrefix(payload.displayUrl ?? null),
        error: payload.error ?? "img_onerror",
      }),
    );
  },

  noValidPhoto(payload: {
    context: string;
    userId?: string | null;
    profileId?: string | null;
    storedRef?: string | null;
    reason?: string;
  }): void {
    console.log(
      "[PhotoFlow] no_valid_photo",
      basePayload({
        context: payload.context,
        userId: payload.userId ?? null,
        profileId: payload.profileId ?? null,
        storedRef: photoUrlPrefix(payload.storedRef ?? null),
        reason: payload.reason ?? "unresolved",
      }),
    );
  },
};
