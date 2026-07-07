import { photoUrlPrefix } from "./profilePhotoPipelineLog";

/** Une seule carte Move tracée par session (première carte affichée). */
let tracedProfileId: string | null = null;
let traceDownloadActive = false;

export type MovePhotoTraceStep =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9;

const STEP_LABELS: Record<MovePhotoTraceStep, string> = {
  1: "données Supabase reçues",
  2: "références photo disponibles",
  3: "URL finale sélectionnée",
  4: "téléchargement HTTP + blob",
  5: "source envoyée au composant Image",
  6: "onLoad déclenché",
  7: "onError déclenché",
  8: "modification de displaySrc",
  9: "displaySrc remis à null",
};

type TraceRecord = {
  step: MovePhotoTraceStep;
  label: string;
  event: string;
  at: number;
  payload?: Record<string, unknown>;
};

const recordsByProfile = new Map<string, TraceRecord[]>();

let imgOnLoadSeen = false;
let imgOnErrorSeen = false;
let lastNonNullDisplaySrc: string | null = null;
let firstNullDisplaySrcStep: MovePhotoTraceStep | null = null;
let candidateRefsCount = 0;
let selectedUrlPresent = false;
let downloadSucceeded = false;
let imgSrcPresent = false;

export function claimMovePhotoTrace(profileId: string | null | undefined): boolean {
  const id = typeof profileId === "string" ? profileId.trim() : "";
  if (!id) return false;
  if (!tracedProfileId) {
    tracedProfileId = id;
    recordsByProfile.set(id, []);
    console.log("[MovePhotoTrace] TRACE_CLAIMED — une seule carte Move", { profileId: id });
    return true;
  }
  return tracedProfileId === id;
}

export function isMovePhotoTraceTarget(profileId: string | null | undefined): boolean {
  const id = typeof profileId === "string" ? profileId.trim() : "";
  return Boolean(id && tracedProfileId === id);
}

export function setMovePhotoTraceDownloadActive(active: boolean): void {
  traceDownloadActive = active;
}

export function isMovePhotoTraceDownloadActive(): boolean {
  return traceDownloadActive && tracedProfileId !== null;
}

export function movePhotoTrace(
  profileId: string | null | undefined,
  step: MovePhotoTraceStep,
  event: string,
  payload: Record<string, unknown> = {},
): void {
  const id =
    typeof profileId === "string" && profileId.trim()
      ? profileId.trim()
      : tracedProfileId;
  if (!id || tracedProfileId !== id) return;
  const record: TraceRecord = {
    step,
    label: STEP_LABELS[step],
    event,
    at: Date.now(),
    payload,
  };
  const list = recordsByProfile.get(id) ?? [];
  list.push(record);
  recordsByProfile.set(id, list);

  if (step === 2 && typeof payload.refCount === "number") {
    candidateRefsCount = payload.refCount;
  }
  if (step === 3) {
    selectedUrlPresent = Boolean(payload.selectedSrc);
  }
  if (step === 4 && payload.ok === true) {
    downloadSucceeded = true;
  }
  if (step === 5) {
    imgSrcPresent = Boolean(payload.imgSrc);
  }
  if (step === 6) {
    imgOnLoadSeen = true;
  }
  if (step === 7) {
    imgOnErrorSeen = true;
  }
  if (step === 8 && typeof payload.to === "string" && payload.to) {
    lastNonNullDisplaySrc = payload.to;
  }
  if (step === 9 && firstNullDisplaySrcStep === null) {
    firstNullDisplaySrcStep = 9;
  }
  if (step === 8 && payload.to === null && payload.from !== null && firstNullDisplaySrcStep === null) {
    firstNullDisplaySrcStep = 8;
  }

  console.log(`[MovePhotoTrace] étape ${step}/9 — ${STEP_LABELS[step]}`, {
    profileId: id,
    event,
    ...payload,
  });
}

function resolveFailureStep(profileId: string): MovePhotoTraceStep {
  const records = recordsByProfile.get(profileId) ?? [];

  if (candidateRefsCount === 0) return 2;

  if (!selectedUrlPresent) {
    const step3 = records.some((r) => r.step === 3);
    if (step3) return 3;
    return 2;
  }

  const step4Attempts = records.filter((r) => r.step === 4);
  if (step4Attempts.length > 0 && !downloadSucceeded && !imgSrcPresent) {
    return 4;
  }

  if (!imgSrcPresent) {
    if (firstNullDisplaySrcStep === 8 || firstNullDisplaySrcStep === 9) {
      return firstNullDisplaySrcStep;
    }
    return 5;
  }

  if (imgOnErrorSeen && !imgOnLoadSeen) return 7;

  if (firstNullDisplaySrcStep === 9) return 9;
  if (firstNullDisplaySrcStep === 8) return 8;

  if (imgOnLoadSeen && !imgSrcPresent) return 5;

  if (!imgOnLoadSeen && imgSrcPresent && !imgOnErrorSeen) return 5;

  return 5;
}

export function emitMovePhotoTraceDiagnosis(profileId: string | null | undefined): void {
  if (!isMovePhotoTraceTarget(profileId)) return;
  const id = profileId!.trim();
  const step = resolveFailureStep(id);
  const records = recordsByProfile.get(id) ?? [];

  console.log("[MovePhotoTrace] ─── chronologie complète ───", {
    profileId: id,
    events: records.map((r) => ({
      step: r.step,
      label: r.label,
      event: r.event,
      payload: r.payload,
    })),
  });

  console.log(
    `[MovePhotoTrace] DIAGNOSTIC: La photo disparaît exactement à l'étape ${step}.`,
    {
      profileId: id,
      étape: step,
      libellé: STEP_LABELS[step],
      imgOnLoadSeen,
      imgOnErrorSeen,
      lastNonNullDisplaySrc: photoUrlPrefix(lastNonNullDisplaySrc),
      candidateRefsCount,
      selectedUrlPresent,
      downloadSucceeded,
      imgSrcPresent,
    },
  );
}

/** Réinitialise la trace (tests uniquement). */
export function resetMovePhotoTraceForTests(): void {
  tracedProfileId = null;
  traceDownloadActive = false;
  recordsByProfile.clear();
  imgOnLoadSeen = false;
  imgOnErrorSeen = false;
  lastNonNullDisplaySrc = null;
  firstNullDisplaySrcStep = null;
  candidateRefsCount = 0;
  selectedUrlPresent = false;
  downloadSucceeded = false;
  imgSrcPresent = false;
}
