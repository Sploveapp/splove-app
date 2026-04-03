import { useEffect, useState } from "react";
import { hasPremiumAccess } from "../services/premium.service";

export function usePremium(profileId: string | null) {
  const [hasPlus, setHasPlus] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
