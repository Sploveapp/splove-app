import { describe, expect, it } from "vitest";
import {
  decideProfileAvatarImgError,
  decideProfileAvatarImgLoad,
  fingerprintProfileAvatarImgSrc,
  profileAvatarImgReactKey,
  shouldUnlockPreferDirectHttps,
} from "./profileAvatarImgRender";

function jpegDataUrl(payloadSuffix: string): string {
  // Préfixe JPEG data URL identique sur >80 chars ; suffixe différent = contenu différent.
  const common =
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcD";
  return `${common}${payloadSuffix}//Z`;
}

describe("profileAvatarImgReactKey", () => {
  it("deux Data URL avec les mêmes 80 premiers caractères mais contenus différents → clés différentes", () => {
    const a = jpegDataUrl("AAA_UNIQUE_PAYLOAD_ONE");
    const b = jpegDataUrl("BBB_UNIQUE_PAYLOAD_TWO");
    expect(a.slice(0, 80)).toBe(b.slice(0, 80));
    expect(profileAvatarImgReactKey(a, 0)).not.toBe(profileAvatarImgReactKey(b, 0));
    expect(fingerprintProfileAvatarImgSrc(a)).not.toBe(fingerprintProfileAvatarImgSrc(b));
  });
});

describe("decideProfileAvatarImgError", () => {
  it("un ancien onError ne peut pas remplacer une nouvelle source", () => {
    const decision = decideProfileAvatarImgError({
      eventSrc: "data:image/jpeg;base64,OLD",
      activeSrc: "data:image/jpeg;base64,NEW",
      sourceKind: "data_url",
      preferDirectHttpsAlready: false,
      httpsFallbackLockedForFingerprint: null,
      activeFingerprint: "fp_new",
    });
    expect(decision.applyPreferDirectHttps).toBe(false);
    expect(decision.callHandlersOnError).toBe(false);
    expect(decision.reason).toBe("stale_error_ignored");
  });

  it("aucun cycle infini de fallback (verrou empreinte)", () => {
    const fp = fingerprintProfileAvatarImgSrc("data:image/jpeg;base64,/9j/ABC");
    const first = decideProfileAvatarImgError({
      eventSrc: "data:image/jpeg;base64,/9j/ABC",
      activeSrc: "data:image/jpeg;base64,/9j/ABC",
      sourceKind: "data_url",
      preferDirectHttpsAlready: false,
      httpsFallbackLockedForFingerprint: null,
      activeFingerprint: fp,
    });
    expect(first.applyPreferDirectHttps).toBe(true);
    expect(first.lockHttpsFallback).toBe(true);

    const locked = decideProfileAvatarImgError({
      eventSrc: "data:image/jpeg;base64,/9j/ABC",
      activeSrc: "data:image/jpeg;base64,/9j/ABC",
      sourceKind: "data_url",
      preferDirectHttpsAlready: false,
      httpsFallbackLockedForFingerprint: fp,
      activeFingerprint: fp,
    });
    expect(locked.applyPreferDirectHttps).toBe(false);
    expect(locked.reason).toBe("https_fallback_locked_no_loop");

    const unlock = shouldUnlockPreferDirectHttps({
      nextIosDataUrl: "data:image/jpeg;base64,/9j/ABC",
      previousIosDataUrl: "data:image/jpeg;base64,/9j/OTHER",
      httpsFallbackLockedForFingerprint: fp,
    });
    expect(unlock.unlock).toBe(false);
    expect(unlock.clearLock).toBe(false);
  });
});

describe("decideProfileAvatarImgLoad", () => {
  it("onLoad avec dimensions positives valide l’image", () => {
    const d = decideProfileAvatarImgLoad({
      naturalWidth: 120,
      naturalHeight: 120,
      eventSrc: "data:image/jpeg;base64,X",
      activeSrc: "data:image/jpeg;base64,X",
    });
    expect(d.acceptAsLoaded).toBe(true);
    expect(d.clearError).toBe(true);
    expect(d.treatAsError).toBe(false);
    expect(d.reason).toBe("natural_size_ok");
  });

  it("onLoad avec dimensions nulles ou zéro est traité comme un échec", () => {
    const d = decideProfileAvatarImgLoad({
      naturalWidth: 0,
      naturalHeight: 0,
      eventSrc: "data:image/jpeg;base64,X",
      activeSrc: "data:image/jpeg;base64,X",
    });
    expect(d.acceptAsLoaded).toBe(false);
    expect(d.treatAsError).toBe(true);
    expect(d.reason).toBe("zero_natural_size_treated_as_error");
  });
});
