const MATCH_INTRO_SEEN_PREFIX = "splove_match_intro_seen_";

export function matchIntroStorageKey(conversationId: string): string {
  return `${MATCH_INTRO_SEEN_PREFIX}${conversationId}`;
}

export function hasSeenMatchIntro(conversationId: string): boolean {
  if (!conversationId.trim()) return true;
  try {
    return localStorage.getItem(matchIntroStorageKey(conversationId)) === "1";
  } catch {
    return false;
  }
}

export function markMatchIntroSeen(conversationId: string): void {
  if (!conversationId.trim()) return;
  try {
    localStorage.setItem(matchIntroStorageKey(conversationId), "1");
  } catch {
    /* quota / private mode */
  }
}
