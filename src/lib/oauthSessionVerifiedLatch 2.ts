/** Session OAuth validée (getSession + getUser) avant mise à jour React AuthContext. */
let oauthSessionVerifiedLatch = false;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function markOAuthSessionVerifiedLatch(): void {
  if (oauthSessionVerifiedLatch) return;
  oauthSessionVerifiedLatch = true;
  notify();
}

export function clearOAuthSessionVerifiedLatch(): void {
  if (!oauthSessionVerifiedLatch) return;
  oauthSessionVerifiedLatch = false;
  notify();
}

export function isOAuthSessionVerifiedLatch(): boolean {
  return oauthSessionVerifiedLatch;
}

export function subscribeOAuthSessionVerifiedLatch(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper */
export function resetOAuthSessionVerifiedLatchForTests(): void {
  oauthSessionVerifiedLatch = false;
  listeners.clear();
}
