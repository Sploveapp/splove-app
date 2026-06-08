import { photoUrlPrefix } from "./profilePhotoPipelineLog";
import type { ProfilePhotoUrlFields } from "./profilePhotoDisplayUrl";

export type PhotoRenderScreen = "Profile" | "EditProfile" | "Move" | "PhotoViewer";

type PhotoRenderPayload = {
  screen: PhotoRenderScreen;
  displaySrc?: string | null;
  resolvedUrl?: string | null;
  profile?: ProfilePhotoUrlFields | null;
  extra?: Record<string, unknown>;
};

function photoFieldSnapshot(profile?: ProfilePhotoUrlFields | null) {
  return {
    main_photo_url: photoUrlPrefix(profile?.main_photo_url ?? null),
    portrait_url: photoUrlPrefix(profile?.portrait_url ?? null),
    fullbody_url: photoUrlPrefix(profile?.fullbody_url ?? null),
    avatar_url: photoUrlPrefix(profile?.avatar_url ?? null),
  };
}

function emit(event: string, payload: PhotoRenderPayload): void {
  console.log(`[PhotoRender] ${event}`, {
    screen: payload.screen,
    displaySrc: photoUrlPrefix(payload.displaySrc ?? null),
    resolvedUrl: photoUrlPrefix(payload.resolvedUrl ?? null),
    ...photoFieldSnapshot(payload.profile),
    ...(payload.extra ?? {}),
  });
}

/** Logs diagnostic affichage `<img>` — diagnostic iOS uniquement, sans effet métier. */
export const PhotoRenderLog = {
  displaySrc(payload: PhotoRenderPayload): void {
    emit("displaySrc", payload);
  },

  resolvedUrl(payload: PhotoRenderPayload): void {
    emit("resolvedUrl", payload);
  },

  imgOnload(payload: PhotoRenderPayload): void {
    emit("img_onload", payload);
  },

  imgOnerror(payload: PhotoRenderPayload): void {
    emit("img_onerror", payload);
  },
};

/** Chaîne handlers existants + log diagnostic (comportement inchangé). */
export function chainPhotoRenderHandlers(
  payload: PhotoRenderPayload,
  handlers?: { onLoad?: () => void; onError?: () => void },
): { onLoad: () => void; onError: () => void } {
  return {
    onLoad: () => {
      PhotoRenderLog.imgOnload(payload);
      handlers?.onLoad?.();
    },
    onError: () => {
      PhotoRenderLog.imgOnerror(payload);
      handlers?.onError?.();
    },
  };
}
