let oauthUxEpoch = 0;
const oauthUxListeners = new Set<() => void>();

export function notifyOAuthUxOverlayChanged(): void {
  oauthUxEpoch += 1;
  for (const listener of oauthUxListeners) {
    listener();
  }
}

export function subscribeOAuthUxOverlay(listener: () => void): () => void {
  oauthUxListeners.add(listener);
  return () => {
    oauthUxListeners.delete(listener);
  };
}

export function getOAuthUxOverlayEpoch(): number {
  return oauthUxEpoch;
}

/** Test helper */
export function resetOAuthUxOverlayEpochForTests(): void {
  oauthUxEpoch = 0;
  oauthUxListeners.clear();
}
