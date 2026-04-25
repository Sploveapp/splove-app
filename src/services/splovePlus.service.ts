import { supabase } from "../lib/supabase";
import { hasPremiumAccess } from "./premium.service";

const STORAGE_PREFIX = "splove_plus";
const GHOST_KEY = "ghost_until";
const AUTO_RELANCE_KEY = "auto_relance_enabled";
const AUTO_RELANCE_SENT_PREFIX = "auto_relance_sent";

export type SplovePlusState = {
  hasPlus: boolean;
  boostEndsAt: string | null;
  ghostEndsAt: string | null;
  autoRelanceEnabled: boolean;
};

function storageKey(profileId: string, key: string): string {
  return `${STORAGE_PREFIX}:${profileId}:${key}`;
}

function readStorage(profileId: string, key: string): string | null {
  try {
    return localStorage.getItem(storageKey(profileId, key));
  } catch {
    return null;
  }
}

function writeStorage(profileId: string, key: string, value: string | null): void {
  try {
    const fullKey = storageKey(profileId, key);
    if (value == null) localStorage.removeItem(fullKey);
    else localStorage.setItem(fullKey, value);
  } catch {
    // ignore storage errors
  }
}

function isFutureIso(iso: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t > Date.now();
}

export async function getSplovePlusState(profileId: string): Promise<SplovePlusState> {
  const [plus, boostRes] = await Promise.all([
    hasPremiumAccess(profileId),
    supabase
      .from("profile_boosts")
      .select("ends_at")
      .eq("profile_id", profileId)
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const boostEndsAt = ((boostRes.data as { ends_at?: string | null } | null)?.ends_at ?? null) || null;
  const rawGhost = readStorage(profileId, GHOST_KEY);
  const ghostEndsAt = isFutureIso(rawGhost) ? rawGhost : null;
  if (rawGhost && !ghostEndsAt) writeStorage(profileId, GHOST_KEY, null);
  const autoRelanceEnabled = readStorage(profileId, AUTO_RELANCE_KEY) === "1";

  return {
    hasPlus: plus,
    boostEndsAt,
    ghostEndsAt,
    autoRelanceEnabled,
  };
}

export function activateGhostMode(profileId: string, durationMinutes: number): string {
  const endsAt = new Date(Date.now() + durationMinutes * 60_000).toISOString();
  writeStorage(profileId, GHOST_KEY, endsAt);
  return endsAt;
}

export function setAutoRelanceEnabled(profileId: string, enabled: boolean): void {
  writeStorage(profileId, AUTO_RELANCE_KEY, enabled ? "1" : "0");
}

export function markAutoRelanceSent(profileId: string, proposalId: string): void {
  writeStorage(profileId, `${AUTO_RELANCE_SENT_PREFIX}:${proposalId}`, "1");
}

export function hasAutoRelanceBeenSent(profileId: string, proposalId: string): boolean {
  return readStorage(profileId, `${AUTO_RELANCE_SENT_PREFIX}:${proposalId}`) === "1";
}

export function isProfileActiveRecently(lastActiveAt: string | null | undefined, maxMinutes = 20): boolean {
  if (!lastActiveAt) return false;
  const t = new Date(lastActiveAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= maxMinutes * 60_000;
}
