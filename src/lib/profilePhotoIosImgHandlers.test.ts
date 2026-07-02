import { describe, expect, it, vi } from "vitest";
import { buildIosAwareProfilePhotoImgHandlers } from "./profilePhotoIosImgHandlers";

vi.mock("./capacitorImageDataUrl", () => ({
  shouldUseIosCapacitorImageFallback: () => true,
}));

describe("buildIosAwareProfilePhotoImgHandlers", () => {
  it("sur iOS, onError délègue d’abord à ios sans avancer le hook photo", () => {
    const iosOnError = vi.fn();
    const photoOnError = vi.fn();
    const photoOnLoad = vi.fn();

    const handlers = buildIosAwareProfilePhotoImgHandlers({
      iosOnError,
      photoOnError,
      photoOnLoad,
      iosResolutionFailed: false,
    });

    handlers.onError();
    expect(iosOnError).toHaveBeenCalledOnce();
    expect(photoOnError).not.toHaveBeenCalled();
  });

  it("sur iOS, avance le hook photo si CapacitorHttp a déjà échoué", () => {
    const iosOnError = vi.fn();
    const photoOnError = vi.fn();

    const handlers = buildIosAwareProfilePhotoImgHandlers({
      iosOnError,
      photoOnError,
      photoOnLoad: vi.fn(),
      iosResolutionFailed: true,
    });

    handlers.onError();
    expect(iosOnError).toHaveBeenCalledOnce();
    expect(photoOnError).toHaveBeenCalledOnce();
  });
});
