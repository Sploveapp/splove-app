import { useEffect, useState } from "react";
import {
  localDayNightPhaseFromDate,
  msUntilNextDayNightBoundary,
  type LocalDayNightPhase,
} from "../lib/localScheduleDayNight";

/**
 * Phase jour / nuit selon l’heure locale (aucune géoloc).
 * Se recale à la prochaine borne 06:30 / 18:30 puis toutes les minutes en secours.
 */
export function useLocalDayNightPhase(): LocalDayNightPhase {
  const [phase, setPhase] = useState<LocalDayNightPhase>(() => localDayNightPhaseFromDate(new Date()));

  useEffect(() => {
    let timer: number | undefined;
    let interval: number | undefined;

    const sync = () => setPhase(localDayNightPhaseFromDate(new Date()));

    const armBoundary = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        sync();
        armBoundary();
      }, msUntilNextDayNightBoundary());
    };

    sync();
    armBoundary();
    interval = window.setInterval(sync, 60_000);

    return () => {
      if (timer) window.clearTimeout(timer);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  return phase;
}
