import { useEffect, useState } from "react";
import { BETA_MODE } from "../constants/beta";
import { hasPremiumAccess } from "../services/premium.service";

export function usePremium(profileId: string | null) {
  const [hasPlus, setHasPlus] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
    hasPremiumAccess(profileId).then((ok) => {
      if (!cancelled) {
        setHasPlus(ok);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  return { hasPlus, isLoading };
}
