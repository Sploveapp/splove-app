const SPLOVE_PLAY_INTRO_DISMISSED_PREFIX = "splove_play_intro_dismissed_";

export function splovePlayIntroStorageKey(userId: string): string {
  return `${SPLOVE_PLAY_INTRO_DISMISSED_PREFIX}${userId}`;
}

export function hasDismissedSplovePlayIntro(userId: string | null | undefined): boolean {
  if (!userId?.trim()) return true;
  try {
    return localStorage.getItem(splovePlayIntroStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markSplovePlayIntroDismissed(userId: string | null | undefined): void {
  if (!userId?.trim()) return;
  try {
    localStorage.setItem(splovePlayIntroStorageKey(userId), "1");
  } catch {
    /* quota / private mode */
  }
}
