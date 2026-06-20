import { afterEach, describe, expect, it, vi } from "vitest";
import { isPhotoDebugEnabled, logPhotoDebug } from "./photoDebugLog";

describe("photoDebugLog", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("désactivé par défaut", () => {
    expect(isPhotoDebugEnabled()).toBe(false);
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logPhotoDebug("upload_result", { ok: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("activé via VITE_PHOTO_DEBUG=true", () => {
    vi.stubEnv("VITE_PHOTO_DEBUG", "true");
    expect(isPhotoDebugEnabled()).toBe(true);
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logPhotoDebug("mergeAuthProfileRow", { userId: "u1" });
    expect(spy).toHaveBeenCalledWith("PHOTO_DEBUG", "mergeAuthProfileRow", { userId: "u1" });
    spy.mockRestore();
  });
});
