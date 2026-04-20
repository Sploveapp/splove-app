import { useEffect, useRef, useState } from "react";
import { getLikesReceived } from "../services/likes.service";
import type { LikeReceived } from "../types/premium.types";

/**
 * Liste des likes reçus — **uniquement** le tableau renvoyé par `getLikesReceived` (déjà filtré).
 * Ignore les réponses obsolètes (courses async / Strict Mode / changement de deps).
 */
export function useLikesReceived(
  profileId: string | null,
  viewerGender?: string | null,
  viewerLookingFor?: string | null,
) {
  const [list, setList] = useState<LikeReceived[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Incrémenté à chaque run d’effet — seule la réponse dont le seq matche encore est appliquée. */
  const fetchGenerationRef = useRef(0);

  useEffect(() => {
    if (!profileId) {
      fetchGenerationRef.current += 1;
      setList([]);
      setLoading(false);
      setError(null);
      return;
    }

    const seq = ++fetchGenerationRef.current;
    setLoading(true);
    setError(null);
    setList([]);

    void getLikesReceived(profileId, {
      gender: viewerGender ?? null,
      looking_for: viewerLookingFor ?? null,
    })
      .then((data) => {
        if (seq !== fetchGenerationRef.current) return;
        setList(data);
      })
      .catch((e) => {
        if (seq !== fetchGenerationRef.current) return;
        setError(e?.message ?? "Erreur");
      })
      .finally(() => {
        if (seq !== fetchGenerationRef.current) return;
        setLoading(false);
      });
  }, [profileId, viewerGender, viewerLookingFor]);

  return { list, setList, loading, error };
}
