import { describe, expect, it, vi } from "vitest";
import { mergeStickyPhotoHandlers } from "./profilePhotoStickyDisplay";

describe("mergeStickyPhotoHandlers", () => {
  it("appelle onLoad sticky puis handler externe", () => {
    const stickyLoad = vi.fn();
    const externalLoad = vi.fn();
    const handlers = mergeStickyPhotoHandlers(
      { onImageLoad: stickyLoad, imageLoaded: false },
      { onLoad: externalLoad },
    );

    handlers.onLoad();
    expect(stickyLoad).toHaveBeenCalledOnce();
    expect(externalLoad).toHaveBeenCalledOnce();
  });

  it("ignore onError si image déjà chargée (garde anti-flash)", () => {
    const externalError = vi.fn();
    const handlers = mergeStickyPhotoHandlers(
      { onImageLoad: () => {}, imageLoaded: true },
      { onError: externalError },
    );

    handlers.onError();
    expect(externalError).not.toHaveBeenCalled();
  });

  it("propage onError si image pas encore chargée", () => {
    const externalError = vi.fn();
    const handlers = mergeStickyPhotoHandlers(
      { onImageLoad: () => {}, imageLoaded: false },
      { onError: externalError },
    );

    handlers.onError();
    expect(externalError).toHaveBeenCalledOnce();
  });
});
