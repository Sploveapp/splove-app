/** Permet au flux OAuth natif (hors React) de resynchroniser AuthContext après setSession. */
type SyncHandler = () => Promise<boolean>;

let syncHandler: SyncHandler | null = null;

export function registerAuthSessionSyncHandler(handler: SyncHandler | null): void {
  syncHandler = handler;
}

export async function requestAuthSessionSync(): Promise<boolean> {
  if (syncHandler) {
    return syncHandler();
  }
  return false;
}
