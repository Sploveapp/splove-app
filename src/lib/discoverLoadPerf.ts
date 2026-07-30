/**
 * Mesures de durée Discover (`loadProfiles`) — logs console uniquement, jamais UI.
 * Filtrer : `[Discover perf]`
 *
 * Objectif : localiser précisément où part le temps (watchdog ~8s), sans changer la logique métier.
 */

export type DiscoverLoadPerfStep =
  | "rpc_fetchDiscoverFeedAlive"
  | "viewer_profile"
  | "geolocation"
  | "likes"
  | "matches"
  | "blocks"
  | "profile_views"
  | "photo_prefetch"
  | "scoring"
  | "react_render";

const STEP_ORDER: DiscoverLoadPerfStep[] = [
  "rpc_fetchDiscoverFeedAlive",
  "viewer_profile",
  "geolocation",
  "likes",
  "matches",
  "blocks",
  "profile_views",
  "photo_prefetch",
  "scoring",
  "react_render",
];

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function round1(ms: number): number {
  return Math.round(ms * 10) / 10;
}

type StepRecord = {
  ms: number;
  note?: string;
  atMs: number;
};

export type DiscoverLoadPerfRun = {
  loadGeneration: number;
  markStart: () => number;
  record: (step: DiscoverLoadPerfStep, startedAt: number, note?: string) => number;
  measureAsync: <T>(
    step: DiscoverLoadPerfStep,
    fn: () => Promise<T>,
    note?: string,
  ) => Promise<T>;
  /** Après setState commit — mesure jusqu’au frame paint (double rAF). */
  scheduleReactRenderMeasure: () => void;
  /** Fin du chemin critique async (avant/pendant paint). */
  finishCriticalPath: (extra?: Record<string, unknown>) => void;
};

export function createDiscoverLoadPerfRun(meta: {
  loadGeneration: number;
  force: boolean;
}): DiscoverLoadPerfRun {
  const t0 = nowMs();
  const steps = new Map<DiscoverLoadPerfStep, StepRecord>();
  let criticalFinished = false;
  let reactMeasured = false;
  let pendingExtra: Record<string, unknown> = {};

  const record = (step: DiscoverLoadPerfStep, startedAt: number, note?: string): number => {
    const end = nowMs();
    const ms = Math.max(0, end - startedAt);
    steps.set(step, { ms, note, atMs: end - t0 });
    console.info("[Discover perf]", {
      step,
      ms: round1(ms),
      sinceLoadStartMs: round1(end - t0),
      loadGeneration: meta.loadGeneration,
      ...(note ? { note } : {}),
    });
    return ms;
  };

  const printSummary = (label: string) => {
    const totalMs = nowMs() - t0;
    const byStep: Record<string, number | string> = {};
    for (const step of STEP_ORDER) {
      const rec = steps.get(step);
      if (!rec) {
        byStep[step] = "(not measured)";
        continue;
      }
      byStep[step] = rec.note ? `${round1(rec.ms)} (${rec.note})` : round1(rec.ms);
    }
    console.info(`[Discover perf] ${label}`, {
      loadGeneration: meta.loadGeneration,
      force: meta.force,
      steps_ms: byStep,
      total_ms: round1(totalMs),
      ...pendingExtra,
    });
    // Ligne compacte lisible dans Xcode / Safari console
    const compact = STEP_ORDER.map((step) => {
      const rec = steps.get(step);
      return `${step}=${rec ? round1(rec.ms) : "—"}`;
    }).join(" | ");
    console.info(
      `[Discover perf] TIMELINE gen=${meta.loadGeneration} | ${compact} | total=${round1(totalMs)}ms`,
    );
  };

  const maybeFinalSummary = () => {
    if (!criticalFinished || !reactMeasured) return;
    printSummary("SUMMARY");
  };

  return {
    loadGeneration: meta.loadGeneration,
    markStart: nowMs,
    record,
    measureAsync: async (step, fn, note) => {
      const startedAt = nowMs();
      try {
        return await fn();
      } finally {
        record(step, startedAt, note);
      }
    },
    scheduleReactRenderMeasure: () => {
      const startedAt = nowMs();
      if (typeof requestAnimationFrame !== "function") {
        record("react_render", startedAt, "no_rAF");
        reactMeasured = true;
        maybeFinalSummary();
        return;
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          record("react_render", startedAt, "double_rAF_after_setState");
          reactMeasured = true;
          maybeFinalSummary();
        });
      });
    },
    finishCriticalPath: (extra = {}) => {
      pendingExtra = { ...pendingExtra, ...extra };
      criticalFinished = true;
      printSummary("CRITICAL_PATH");
      maybeFinalSummary();
    },
  };
}

/** @deprecated — préférer createDiscoverLoadPerfRun */
export type DiscoverPerfStep =
  | DiscoverLoadPerfStep
  | "bootstrap_parallel"
  | "viewer_sports"
  | "sport_match_pref"
  | "feed_alive"
  | "exclusions_likes_matches_blocks"
  | "distances"
  | "scoring_pipeline"
  | "profile_views_ordering"
  | "photo_prefetch_kickoff"
  | "total";

type StepSample = { sumMs: number; maxMs: number; count: number };

const samples = new Map<string, StepSample>();

export function discoverPerfResetSession(): void {
  /* aggregates kept for session averages */
}

export function discoverPerfMarkStart(): number {
  return nowMs();
}

export function discoverPerfRecord(step: string, startedAt: number): number {
  const end = nowMs();
  const ms = Math.max(0, end - startedAt);
  const prev = samples.get(step) ?? { sumMs: 0, maxMs: 0, count: 0 };
  const next = {
    sumMs: prev.sumMs + ms,
    maxMs: Math.max(prev.maxMs, ms),
    count: prev.count + 1,
  };
  samples.set(step, next);
  console.info("[Discover perf]", {
    step,
    ms: round1(ms),
    avgMs: round1(next.sumMs / next.count),
    maxMs: round1(next.maxMs),
    n: next.count,
  });
  return ms;
}

export function discoverPerfSnapshot(): Array<{
  step: string;
  avgMs: number;
  maxMs: number;
  n: number;
}> {
  return [...samples.entries()].map(([step, s]) => ({
    step,
    avgMs: round1(s.sumMs / s.count),
    maxMs: round1(s.maxMs),
    n: s.count,
  }));
}
