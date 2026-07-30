import { describe, expect, it, vi } from "vitest";
import { mergeStickyPhotoHandlers } from "./profilePhotoStickyDisplay";

describe("mergeStickyPhotoHandlers", () => {
  it("appelle onLoad sticky puis handler externe", () => {
    const stickyLoad = vi.fn();
    const externalLoad = vi.fn();
    const handlers = mergeStickyPhotoHandlers(
      { onImageLoad: stickyLoad, imageLoaded: false, resetSticky: vi.fn() },
      { onLoad: externalLoad },
    );

    handlers.onLoad();
    expect(stickyLoad).toHaveBeenCalledOnce();
    expect(externalLoad).toHaveBeenCalledOnce();
  });

  it("propage onError et reset sticky même si image déjà chargée", () => {
    const externalError = vi.fn();
    const resetSticky = vi.fn();
    const handlers = mergeStickyPhotoHandlers(
      { onImageLoad: () => {}, imageLoaded: true, resetSticky },
      { onError: externalError },
    );

    handlers.onError();
    expect(resetSticky).toHaveBeenCalledOnce();
    expect(externalError).toHaveBeenCalledOnce();
  });

  it("propage onError si image pas encore chargée", () => {
    const externalError = vi.fn();
    const resetSticky = vi.fn();
    const handlers = mergeStickyPhotoHandlers(
      { onImageLoad: () => {}, imageLoaded: false, resetSticky },
      { onError: externalError },
    );

    handlers.onError();
    expect(resetSticky).toHaveBeenCalledOnce();
    expect(externalError).toHaveBeenCalledOnce();
  });
});
