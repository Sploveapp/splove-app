import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  resolveSplovePlayAccess,
  type SplovePlayAccess,
} from "../lib/splovePlayAccess";

const LOCKED_INITIAL: SplovePlayAccess = {
  canSendPremiumPlays: false,
  canReadReceivedPlays: false,
  viaSplovePlus: false,
  viaPlayPack: false,
  trialQuotaRemaining: null,
};

let cachedUserId: string | null = null;
let cachedAccess: SplovePlayAccess | null = null;
let inflight: Promise<SplovePlayAccess> | null = null;

export function invalidateSplovePlayAccessCache(): void {
  cachedUserId = null;
  cachedAccess = null;
  inflight = null;
}

/** Droits Play — réutilise `hasPremiumAccess` (SPLove+ existant). */
export function useSplovePlayAccess(): SplovePlayAccess {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [access, setAccess] = useState<SplovePlayAccess>(LOCKED_INITIAL);

  useEffect(() => {
    if (!userId) {
      setAccess(LOCKED_INITIAL);
      return;
    }
    if (cachedUserId === userId && cachedAccess) {
      setAccess(cachedAccess);
      return;
    }
    if (!inflight) {
      inflight = resolveSplovePlayAccess(userId).then((next) => {
        cachedUserId = userId;
        cachedAccess = next;
        inflight = null;
        return next;
      });
    }
    let cancelled = false;
    void inflight.then((next) => {
      if (!cancelled) setAccess(next);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return access;
}
