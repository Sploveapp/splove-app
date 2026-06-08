import { useEffect, useState } from "react";
import { BETA_MODE } from "../constants/beta";
import { deferSecondaryWork } from "../lib/deferSecondaryWork";
import { isNativeCapacitorApp } from "../lib/authRedirect";
import { hasPremiumAccess } from "../services/premium.service";

export function usePremium(profileId: string | null) {
  const [hasPlus, setHasPlus] = useState(BETA_MODE);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (BETA_MODE && profileId) {
      setHasPlus(true);
      setIsLoading(false);
      return;
    }
    if (!profileId) {
      setHasPlus(false);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const deferMs = isNativeCapacitorApp() ? 3_500 : 1_200;
    const cancelDefer = deferSecondaryWork(() => {
      setIsLoading(true);
      void hasPremiumAccess(profileId).then((ok) => {
        if (!cancelled) {
          setHasPlus(ok);
          setIsLoading(false);
        }
      });
    }, deferMs);
    return () => {
      cancelled = true;
      cancelDefer();
    };
  }, [profileId]);

  return { hasPlus, isLoading };
}
