import { useCallback, useEffect, useMemo, useState } from "react";

const K = {
  active: "plus_active",
  priority: "priority_proposals",
  ghost: "ghost_mode",
  ghostStartTime: "ghost_start_time",
  ghostDuration: "ghost_duration",
  places: "common_places",
  reminders: "smart_reminders",
  boost: "smart_boost",
  oneShotBoost: "boost_active",
  oneShotBoostDuration: "boost_duration",
  oneShotBoostStartTime: "boost_start_time",
  oneShotBoostViews: "boost_views",
  oneShotBoostLastMinuteGain: "boost_last_minute_gain",
  oneShotGhost24h: "ghost_24h",
  oneShotPriority: "priority_one_shot",
  oneShotPlaces24h: "common_places_24h",
  oneShotReminder: "smart_reminder_one_shot",
} as const;

type BoostStats = {
  isActive: boolean;
  remainingTime: number;
  views: number;
  lastMinuteGain: number;
};

function buildKey(userId: string | null, suffix: string): string | null {
  if (!userId) return null;
  return `splove_${userId}_${suffix}`;
}

function readBool(userId: string | null, suffix: string): boolean {
  const key = buildKey(userId, suffix);
  if (!key) return false;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeBool(userId: string | null, suffix: string, value: boolean) {
  const key = buildKey(userId, suffix);
  if (!key) return;
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // ignore localStorage errors
  }
}

function readDuration(userId: string | null): "30" | "60" | null {
  const key = buildKey(userId, K.oneShotBoostDuration);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw === "30" || raw === "60" ? raw : null;
  } catch {
    return null;
  }
}

function readBoostStartTime(userId: string | null): number | null {
  const key = buildKey(userId, K.oneShotBoostStartTime);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readInt(userId: string | null, suffix: string): number {
  const key = buildKey(userId, suffix);
  if (!key) return 0;
  try {
    const parsed = Number(localStorage.getItem(key));
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  } catch {
    return 0;
  }
}

function writeInt(userId: string | null, suffix: string, value: number) {
  const key = buildKey(userId, suffix);
  if (!key) return;
  try {
    localStorage.setItem(key, String(Math.max(0, Math.floor(value))));
  } catch {
    // ignore localStorage errors
  }
}

function clearGhostStorage(userId: string | null) {
  const activeKey = buildKey(userId, K.ghost);
  const startKey = buildKey(userId, K.ghostStartTime);
  const durationKey = buildKey(userId, K.ghostDuration);
  if (!activeKey) return;
  try {
    localStorage.removeItem(activeKey);
    if (startKey) localStorage.removeItem(startKey);
    if (durationKey) localStorage.removeItem(durationKey);
  } catch {
    // ignore localStorage errors
  }
}

function isGhostModeActive(userId: string | null): boolean {
  const activeKey = buildKey(userId, K.ghost);
  const startKey = buildKey(userId, K.ghostStartTime);
  const durationKey = buildKey(userId, K.ghostDuration);
  if (!activeKey) return false;
  try {
    const active = localStorage.getItem(activeKey) === "true";
    if (!active) return false;
    const startRaw = startKey ? localStorage.getItem(startKey) : null;
    const durationRaw = durationKey ? localStorage.getItem(durationKey) : null;
    if (!startRaw || !durationRaw) {
      clearGhostStorage(userId);
      return false;
    }
    const start = Number(startRaw);
    const durationHours = Number(durationRaw);
    if (!Number.isFinite(start) || !Number.isFinite(durationHours) || durationHours <= 0) {
      clearGhostStorage(userId);
      return false;
    }
    const expiresAt = start + durationHours * 60 * 60 * 1000;
    if (Date.now() >= expiresAt) {
      clearGhostStorage(userId);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function writeGhostMode(userId: string | null, enabled: boolean, durationHours = 24) {
  if (!userId) return;
  if (!enabled) {
    clearGhostStorage(userId);
    return;
  }
  writeBool(userId, K.ghost, true);
  const startKey = buildKey(userId, K.ghostStartTime);
  const durationKey = buildKey(userId, K.ghostDuration);
  try {
    if (startKey) localStorage.setItem(startKey, Date.now().toString());
    if (durationKey) localStorage.setItem(durationKey, String(durationHours));
  } catch {
    // ignore localStorage errors
  }
}

function readBoostStats(userId: string | null): BoostStats {
  const views = readInt(userId, K.oneShotBoostViews);
  const lastMinuteGain = readInt(userId, K.oneShotBoostLastMinuteGain);
  const duration = readDuration(userId);
  const start = readBoostStartTime(userId);
  const active = readBool(userId, K.oneShotBoost);
  if (!active || !duration || !start) {
    return { isActive: false, remainingTime: 0, views, lastMinuteGain };
  }
  const durationMs = (duration === "60" ? 60 : 30) * 60 * 1000;
  const remainingTime = Math.max(0, start + durationMs - Date.now());
  if (remainingTime <= 0) {
    writeBool(userId, K.oneShotBoost, false);
    writeInt(userId, K.oneShotBoostLastMinuteGain, 0);
    return { isActive: false, remainingTime: 0, views, lastMinuteGain: 0 };
  }
  return { isActive: true, remainingTime, views, lastMinuteGain };
}

export function getBoostStats(userId: string | null): BoostStats {
  return readBoostStats(userId);
}

export function getGhostModeStatus(userId: string | null): boolean {
  return isGhostModeActive(userId);
}

export function useSplovePlus(userId: string | null) {
  const [isActive, setIsActive] = useState<boolean>(() => readBool(userId, K.active));
  const [isPriorityEnabled, setIsPriorityEnabled] = useState<boolean>(() => readBool(userId, K.priority));
  const [isGhostEnabled, setIsGhostEnabled] = useState<boolean>(() => isGhostModeActive(userId));
  const [isPlacesEnabled, setIsPlacesEnabled] = useState<boolean>(() => readBool(userId, K.places));
  const [isRemindersEnabled, setIsRemindersEnabled] = useState<boolean>(() => readBool(userId, K.reminders));
  const [isBoostEnabled, setIsBoostEnabled] = useState<boolean>(() => readBool(userId, K.boost));
  const [isOneShotBoostActive, setIsOneShotBoostActive] = useState<boolean>(() => readBool(userId, K.oneShotBoost));
  const [oneShotBoostDuration, setOneShotBoostDuration] = useState<"30" | "60" | null>(() => {
    return readDuration(userId);
  });
  const [isOneShotGhostActive, setIsOneShotGhostActive] = useState<boolean>(() => readBool(userId, K.oneShotGhost24h));
  const [isOneShotPriorityActive, setIsOneShotPriorityActive] = useState<boolean>(() => readBool(userId, K.oneShotPriority));
  const [isOneShotPlacesActive, setIsOneShotPlacesActive] = useState<boolean>(() => readBool(userId, K.oneShotPlaces24h));
  const [isOneShotReminderActive, setIsOneShotReminderActive] = useState<boolean>(() => readBool(userId, K.oneShotReminder));
  const [boostStats, setBoostStats] = useState<BoostStats>(() => getBoostStats(userId));

  useEffect(() => {
    setIsActive(readBool(userId, K.active));
    setIsPriorityEnabled(readBool(userId, K.priority));
    setIsGhostEnabled(isGhostModeActive(userId));
    setIsPlacesEnabled(readBool(userId, K.places));
    setIsRemindersEnabled(readBool(userId, K.reminders));
    setIsBoostEnabled(readBool(userId, K.boost));
    setIsOneShotBoostActive(readBool(userId, K.oneShotBoost));
    setOneShotBoostDuration(readDuration(userId));
    setIsOneShotGhostActive(readBool(userId, K.oneShotGhost24h));
    setIsOneShotPriorityActive(readBool(userId, K.oneShotPriority));
    setIsOneShotPlacesActive(readBool(userId, K.oneShotPlaces24h));
    setIsOneShotReminderActive(readBool(userId, K.oneShotReminder));
    setBoostStats(getBoostStats(userId));
  }, [userId]);

  useEffect(() => {
    const tick = () => {
      const current = getBoostStats(userId);
      if (!current.isActive) {
        setBoostStats(current);
        setIsOneShotBoostActive(readBool(userId, K.oneShotBoost));
        return;
      }
      const gain = Math.floor(Math.random() * 5) + 2; // 2..6
      const nextViews = current.views + gain;
      writeInt(userId, K.oneShotBoostViews, nextViews);
      writeInt(userId, K.oneShotBoostLastMinuteGain, gain);
      setBoostStats({
        ...current,
        views: nextViews,
        lastMinuteGain: gain,
      });
    };
    const initial = getBoostStats(userId);
    setBoostStats(initial);
    setIsOneShotBoostActive(initial.isActive);
    const id = window.setInterval(tick, 60 * 1000);
    return () => window.clearInterval(id);
  }, [userId]);

  const activate = useCallback(() => {
    if (!userId) return;
    writeBool(userId, K.active, true);
    writeBool(userId, K.priority, true);
    writeGhostMode(userId, true, 24);
    writeBool(userId, K.places, true);
    writeBool(userId, K.reminders, true);
    writeBool(userId, K.boost, true);
    setIsActive(true);
    setIsPriorityEnabled(true);
    setIsGhostEnabled(true);
    setIsPlacesEnabled(true);
    setIsRemindersEnabled(true);
    setIsBoostEnabled(true);
  }, [userId]);

  const togglePriority = useCallback(() => {
    if (!isActive || !userId) return;
    const next = !isPriorityEnabled;
    writeBool(userId, K.priority, next);
    setIsPriorityEnabled(next);
  }, [isActive, isPriorityEnabled, userId]);

  const toggleGhost = useCallback(() => {
    if (!isActive || !userId) return;
    const next = !isGhostEnabled;
    writeGhostMode(userId, next, 24);
    setIsGhostEnabled(next);
  }, [isActive, isGhostEnabled, userId]);

  const togglePlaces = useCallback(() => {
    if (!isActive || !userId) return;
    const next = !isPlacesEnabled;
    writeBool(userId, K.places, next);
    setIsPlacesEnabled(next);
  }, [isActive, isPlacesEnabled, userId]);

  const toggleReminders = useCallback(() => {
    if (!isActive || !userId) return;
    const next = !isRemindersEnabled;
    writeBool(userId, K.reminders, next);
    setIsRemindersEnabled(next);
  }, [isActive, isRemindersEnabled, userId]);

  const toggleBoost = useCallback(() => {
    if (!isActive || !userId) return;
    const next = !isBoostEnabled;
    writeBool(userId, K.boost, next);
    setIsBoostEnabled(next);
  }, [isActive, isBoostEnabled, userId]);

  const activateOneShotBoost = useCallback((duration: "30" | "60") => {
    if (!userId) return;
    writeBool(userId, K.oneShotBoost, true);
    const durationKey = buildKey(userId, K.oneShotBoostDuration);
    const startKey = buildKey(userId, K.oneShotBoostStartTime);
    if (!durationKey) return;
    try {
      localStorage.setItem(durationKey, duration);
      if (startKey) localStorage.setItem(startKey, Date.now().toString());
    } catch {
      // ignore localStorage errors
    }
    writeInt(userId, K.oneShotBoostViews, 0);
    writeInt(userId, K.oneShotBoostLastMinuteGain, 0);
    setIsOneShotBoostActive(true);
    setOneShotBoostDuration(duration);
    setBoostStats({
      isActive: true,
      remainingTime: (duration === "60" ? 60 : 30) * 60 * 1000,
      views: 0,
      lastMinuteGain: 0,
    });
  }, [userId]);

  const activateOneShotGhost = useCallback(() => {
    if (!userId) return;
    writeBool(userId, K.oneShotGhost24h, true);
    writeGhostMode(userId, true, 24);
    setIsGhostEnabled(true);
    setIsOneShotGhostActive(true);
  }, [userId]);

  const activateOneShotPriority = useCallback(() => {
    if (!userId) return;
    writeBool(userId, K.oneShotPriority, true);
    setIsOneShotPriorityActive(true);
  }, [userId]);

  const activateOneShotPlaces = useCallback(() => {
    if (!userId) return;
    writeBool(userId, K.oneShotPlaces24h, true);
    setIsOneShotPlacesActive(true);
  }, [userId]);

  const activateOneShotReminder = useCallback(() => {
    if (!userId) return;
    writeBool(userId, K.oneShotReminder, true);
    setIsOneShotReminderActive(true);
  }, [userId]);

  return useMemo(
    () => ({
      isActive,
      activate,
      isPriorityEnabled,
      isGhostEnabled,
      isPlacesEnabled,
      isRemindersEnabled,
      isBoostEnabled,
      isOneShotBoostActive,
      oneShotBoostDuration,
      isOneShotGhostActive,
      isOneShotPriorityActive,
      isOneShotPlacesActive,
      isOneShotReminderActive,
      togglePriority,
      toggleGhost,
      togglePlaces,
      toggleReminders,
      toggleBoost,
      activateOneShotBoost,
      activateOneShotGhost,
      activateOneShotPriority,
      activateOneShotPlaces,
      activateOneShotReminder,
      boostStats,
      getBoostStats: () => getBoostStats(userId),
    }),
    [
      isActive,
      activate,
      isPriorityEnabled,
      isGhostEnabled,
      isPlacesEnabled,
      isRemindersEnabled,
      isBoostEnabled,
      isOneShotBoostActive,
      oneShotBoostDuration,
      isOneShotGhostActive,
      isOneShotPriorityActive,
      isOneShotPlacesActive,
      isOneShotReminderActive,
      togglePriority,
      toggleGhost,
      togglePlaces,
      toggleReminders,
      toggleBoost,
      activateOneShotBoost,
      activateOneShotGhost,
      activateOneShotPriority,
      activateOneShotPlaces,
      activateOneShotReminder,
      boostStats,
      userId,
    ],
  );
}
