import type { NormalizedModerationLabels } from "./risk.ts";

/** Champs internes 0–1 (scores) et booléens, après normalisation provider. */
export type InternalNormalizedScores = {
  nudity_score: number;
  violence_score: number;
  weapon_score: number;
  spoof_score: number;
  multiple_faces: boolean;
  face_visible: boolean;
  irrelevant_image: boolean;
  low_quality: boolean;
};

function levelToUnit(level: string | undefined): number {
  if (level === "high") return 0.92;
  if (level === "medium") return 0.55;
  if (level === "low") return 0.22;
  return 0;
}

export function buildInternalNormalizedScores(
  labels: NormalizedModerationLabels,
  photoSlot: number,
): InternalNormalizedScores {
  const fc = labels.faceCount ?? 0;
  let faceVisible = fc >= 1;
  if (photoSlot === 1 && (labels.primaryFaceVisible === false || fc === 0)) {
    faceVisible = false;
  }
  return {
    nudity_score: levelToUnit(labels.explicitNudity),
    violence_score: levelToUnit(labels.violence),
    weapon_score: levelToUnit(labels.weapon),
    spoof_score: labels.spoofOrManipSuspicious ? 0.72 : 0,
    multiple_faces: fc > 1,
    face_visible: faceVisible,
    irrelevant_image: !!labels.textHeavyOrNonProfile,
    low_quality: !!labels.lowQuality,
  };
}
