import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  hasDismissedSplovePlayIntro,
  markSplovePlayIntroDismissed,
  splovePlayIntroStorageKey,
} from "./splovePlayIntroStorage";

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("splovePlayIntroStorage", () => {
  const userId = "user-test-123";
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createLocalStorageMock(),
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it("builds a stable storage key", () => {
    expect(splovePlayIntroStorageKey(userId)).toBe("splove_play_intro_dismissed_user-test-123");
  });

  it("marks intro as dismissed once", () => {
    expect(hasDismissedSplovePlayIntro(userId)).toBe(false);
    markSplovePlayIntroDismissed(userId);
    expect(hasDismissedSplovePlayIntro(userId)).toBe(true);
  });

  it("treats missing user as already dismissed", () => {
    expect(hasDismissedSplovePlayIntro(null)).toBe(true);
  });
});
