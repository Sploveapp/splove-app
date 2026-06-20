import { beforeEach, describe, expect, it, vi } from "vitest";

const preferencesGet = vi.fn();
const preferencesSet = vi.fn();
const preferencesRemove = vi.fn();

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: (...args: unknown[]) => preferencesGet(...args),
    set: (...args: unknown[]) => preferencesSet(...args),
    remove: (...args: unknown[]) => preferencesRemove(...args),
    keys: vi.fn().mockResolvedValue({ keys: [] }),
  },
}));

import {
  clearCapacitorAuthStorageMemoryCache,
  createCapacitorAuthStorage,
} from "./supabaseCapacitorStorage";

describe("supabaseCapacitorStorage", () => {
  beforeEach(() => {
    clearCapacitorAuthStorageMemoryCache();
    preferencesGet.mockReset();
    preferencesSet.mockReset();
    preferencesRemove.mockReset();
    preferencesGet.mockResolvedValue({ value: '{"access_token":"x"}' });
    preferencesSet.mockResolvedValue(undefined);
    preferencesRemove.mockResolvedValue(undefined);
  });

  it("lit Preferences une seule fois pour des getItem répétés sur la même clé", async () => {
    const storage = createCapacitorAuthStorage();

    await storage.getItem("splove-auth");
    await storage.getItem("splove-auth");
    await storage.getItem("splove-auth");

    expect(preferencesGet).toHaveBeenCalledTimes(1);
    expect(preferencesGet).toHaveBeenCalledWith({ key: "splove-auth" });
  });

  it("dédoublonne les lectures concurrentes sur la même clé", async () => {
    const storage = createCapacitorAuthStorage();
    let resolveGet: (value: { value: string }) => void = () => undefined;
    preferencesGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGet = resolve;
        }),
    );

    const first = storage.getItem("splove-auth");
    const second = storage.getItem("splove-auth");
    resolveGet({ value: "cached-value" });

    await expect(Promise.all([first, second])).resolves.toEqual([
      "cached-value",
      "cached-value",
    ]);
    expect(preferencesGet).toHaveBeenCalledTimes(1);
  });

  it("met à jour le cache mémoire après setItem et removeItem sans relire Preferences", async () => {
    const storage = createCapacitorAuthStorage();

    await storage.getItem("splove-auth");
    expect(preferencesGet).toHaveBeenCalledTimes(1);

    await storage.setItem("splove-auth", "next");
    await expect(storage.getItem("splove-auth")).resolves.toBe("next");
    expect(preferencesGet).toHaveBeenCalledTimes(1);

    await storage.removeItem("splove-auth");
    await expect(storage.getItem("splove-auth")).resolves.toBeNull();
    expect(preferencesGet).toHaveBeenCalledTimes(1);
  });
});
