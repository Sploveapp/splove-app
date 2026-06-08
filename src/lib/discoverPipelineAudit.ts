/**
 * Logs temporaires du pipeline Discover — dev uniquement.
 */
export const DISCOVER_PIPELINE_AUDIT = import.meta.env.DEV;

export function discoverPipelineStage(
  stage: string,
  before: number,
  after: number,
  extra?: Record<string, unknown>,
): void {
  if (!DISCOVER_PIPELINE_AUDIT) return;
  console.log("[Discover pipeline] stage", {
    stage,
    before,
    after,
    removed: Math.max(0, before - after),
    ...(extra ?? {}),
  });
}

export function discoverPipelineExclusions<T extends { id?: string | null; first_name?: string | null }>(
  step: string,
  prev: T[],
  next: T[],
  reasonFor: (p: T) => string,
  pipelineDetail?: string,
): void {
  if (!DISCOVER_PIPELINE_AUDIT) return;
  const nextIds = new Set(next.map((x) => x.id).filter((id): id is string => Boolean(id)));
  for (const p of prev) {
    const id = p?.id;
    if (id && nextIds.has(id)) continue;
    console.log("[Discover pipeline] excluded", {
      step,
      id: id ?? null,
      first_name: p.first_name ?? null,
      exclusion_reason: reasonFor(p),
      ...(pipelineDetail ? { pipeline_detail: pipelineDetail } : {}),
    });
  }
}

export function discoverPipelineScoringZero(inputCount: number, summary: Record<string, unknown>): void {
  if (!DISCOVER_PIPELINE_AUDIT || inputCount <= 0) return;
  console.warn("[Discover pipeline] scoring eliminated all candidates", {
    input_count: inputCount,
    ...summary,
  });
}

/** TEMPORAIRE : afficher le feed « after completeness » si le scoring renvoie 0. */
export const DISCOVER_SCORING_FALLBACK_AFTER_COMPLETENESS = true;

export type DiscoverProfileScoringAudit = {
  profile_id: string;
  first_name: string | null;
  included: boolean;
  discover_score: number | null;
  practice_score: number | null;
  /** Premier filtre bloquant (canonique). */
  primary_filter: string | null;
  /** Raisons canoniques (ex. radius, gender_mismatch). */
  reasons: string[];
  raw_exclusion: string[];
};

export function logProfileExcludedAudits(audits: DiscoverProfileScoringAudit[]): void {
  if (!DISCOVER_PIPELINE_AUDIT) return;
  for (const a of audits) {
    if (a.included) {
      console.log("PROFILE_INCLUDED:", {
        profile_id: a.profile_id,
        first_name: a.first_name,
        discover_score: a.discover_score,
        practice_score: a.practice_score,
      });
      continue;
    }
    console.log("PROFILE_EXCLUDED:", {
      profile_id: a.profile_id,
      first_name: a.first_name,
      primary_filter: a.primary_filter,
      reasons: a.reasons,
      discover_score: a.discover_score,
      practice_score: a.practice_score,
      raw_exclusion: a.raw_exclusion,
    });
  }
}
