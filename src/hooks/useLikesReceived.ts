import { useEffect, useState } from "react";
import { getLikesReceived } from "../services/likes.service";
import type { LikeReceived } from "../types/premium.types";

export function useLikesReceived(profileId: string | null) {
  const [list, setList] = useState<LikeReceived[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) {
      setList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getLikesReceived(profileId)
      .then((data) => setList(data))
      .catch((e) => setError(e?.message ?? "Erreur"))
      .finally(() => setLoading(false));
  }, [profileId]);

  return { list, setList, loading, error };
}
