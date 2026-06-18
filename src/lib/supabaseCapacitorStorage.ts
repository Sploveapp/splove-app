import { Preferences } from "@capacitor/preferences";
import type { SupportedStorage } from "@supabase/supabase-js";

type SupabaseAuthStorage = SupportedStorage;

/**
 * Storage auth Supabase pour Capacitor iOS/Android.
 * Preferences est plus fiable que localStorage au redemarrage WebView.
 */
export function createCapacitorAuthStorage(): SupabaseAuthStorage {
  return {
    async getItem(key: string): Promise<string | null> {
      const { value } = await Preferences.get({ key });
      return value ?? null;
    },
    async setItem(key: string, value: string): Promise<void> {
      await Preferences.set({ key, value });
    },
    async removeItem(key: string): Promise<void> {
      await Preferences.remove({ key });
    },
  };
}

/** No-op — compat tests / futur cache mémoire. */
export function clearCapacitorAuthStorageMemoryCache(): void {}

export async function logAuthStorageState(storageKey: string): Promise<void> {
  console.log("AUTH_STORAGE_READ_START", { storageKey });
  try {
    const { keys } = await Preferences.keys();
    const hasAuthKeys = keys.some((k) => k.includes(storageKey));
    if (!hasAuthKeys) {
      console.log("AUTH_STORAGE_EMPTY", { storageKey });
      return;
    }
    console.log("AUTH_STORAGE_HAS_KEYS", {
      storageKey,
      matchingKeys: keys.filter((k) => k.includes(storageKey)).length,
    });
  } catch (e) {
    console.warn("[AuthStorage] Preferences.keys failed", e);
  }
}
