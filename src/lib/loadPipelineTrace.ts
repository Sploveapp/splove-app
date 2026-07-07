export type LoadPipelinePhase = "BOOT" | "AUTH" | "PROFILE" | "PHOTOS" | "UI";

export type LoadPipelineStep =
  | "app started"
  | "session received"
  | "request start"
  | "request end"
  | "references loaded"
  | "urls resolved"
  | "cache lookup start"
  | "cache lookup end"
  | "image preload start"
  | "image preload end"
  | "avatar render"
  | "edit profile render"
  | "edit photos render"
  | "hide finalization splash";

type TimelineEntry = {
  phase: LoadPipelinePhase;
  step: LoadPipelineStep;
  ts: number;
  sinceBootMs: number;
  sincePrevMs: number;
  extra?: Record<string, unknown>;
};

let bootTs: number | null = null;
let lastTs: number | null = null;
const timeline: TimelineEntry[] = [];
const onceKeys = new Set<string>();

/** Horodatage + delta depuis boot et depuis l’étape précédente. */
export function traceLoadPipeline(
  phase: LoadPipelinePhase,
  step: LoadPipelineStep,
  extra?: Record<string, unknown>,
): void {
  const now = Date.now();
  if (bootTs === null) {
    bootTs = now;
  }
  const sinceBootMs = now - bootTs;
  const sincePrevMs = lastTs === null ? 0 : now - lastTs;
  lastTs = now;

  const entry: TimelineEntry = { phase, step, ts: now, sinceBootMs, sincePrevMs, extra };
  timeline.push(entry);

  console.log(`[${phase}]`, step, {
    ts: now,
    sinceBootMs,
    sincePrevMs,
    ...extra,
  });
}

/** Une seule fois par clé (ex. avatar render). */
export function traceLoadPipelineOnce(
  key: string,
  phase: LoadPipelinePhase,
  step: LoadPipelineStep,
  extra?: Record<string, unknown>,
): void {
  if (onceKeys.has(key)) return;
  onceKeys.add(key);
  traceLoadPipeline(phase, step, extra);
}

/** AUTH — une fois par userId. */
let lastTracedAuthUserId: string | null = null;

export function traceAuthSessionReceived(
  userId: string,
  source: string,
  extra?: Record<string, unknown>,
): void {
  if (!userId || lastTracedAuthUserId === userId) return;
  lastTracedAuthUserId = userId;
  traceLoadPipeline("AUTH", "session received", {
    userId: userId.slice(0, 8),
    source,
    ...extra,
  });
}

/** PROFILE — paires start/end corrélées par scope. */
const profileRequestStartByScope = new Map<string, number>();

export function traceProfileRequestStart(
  scope: string,
  extra?: Record<string, unknown>,
): void {
  profileRequestStartByScope.set(scope, Date.now());
  traceLoadPipeline("PROFILE", "request start", { scope, ...extra });
}

export function traceProfileRequestEnd(
  scope: string,
  extra?: Record<string, unknown>,
): void {
  const startedAt = profileRequestStartByScope.get(scope);
  const requestDurationMs =
    startedAt !== undefined ? Date.now() - startedAt : undefined;
  profileRequestStartByScope.delete(scope);
  traceLoadPipeline("PROFILE", "request end", {
    scope,
    requestDurationMs,
    ...extra,
  });
}

/** Résumé chronologique (debug manuel). */
export function dumpLoadPipelineTimeline(): void {
  console.log("[LOAD_PIPELINE] timeline complète", timeline);
}
