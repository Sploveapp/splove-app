/** Normalized labels from any provider (Sightengine, stub, …). */
export type NormalizedModerationLabels = {
  explicitNudity?: "none" | "low" | "medium" | "high";
  violence?: "none" | "low" | "medium" | "high";
  weapon?: "none" | "low" | "medium" | "high";
  /** Nombre de visages détectés (approximatif). */
  faceCount?: number;
  /** Visage principal clairement visible (slot 1). */
  primaryFaceVisible?: boolean;
  spoofOrManipSuspicious?: boolean;
  textHeavyOrNonProfile?: boolean;
  lowQuality?: boolean;
};

export type DecisionBand = "approved" | "pending_review" | "rejected";

export type RiskDecision = {
  riskScore: number;
  band: DecisionBand;
  decisionReason: string;
  /** Code court pour mapping UI (onboarding / profil). */
  uiReasonCode?: string;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Score interne 0–100 + décision par seuils produit.
 * Favorise pending_review pour les zones grises (sport / plage non explicite = pas de +80 brutal seul).
 */
export function scoreFromLabels(
  labels: NormalizedModerationLabels,
  photoSlot: number,
): RiskDecision {
  let score = 0;
  const reasons: string[] = [];

  const ex = labels.explicitNudity ?? "none";
  if (ex === "high") {
    score += 80;
    reasons.push("explicit_high");
  } else if (ex === "medium") {
    score += 45;
    reasons.push("explicit_medium");
  } else if (ex === "low") {
    score += 18;
    reasons.push("explicit_low");
  }

  const viol = labels.violence ?? "none";
  if (viol === "high") {
    score += 80;
    reasons.push("violence_high");
  } else if (viol === "medium") {
    score += 40;
    reasons.push("violence_medium");
  } else if (viol === "low") {
    score += 12;
    reasons.push("violence_low");
  }

  const weap = labels.weapon ?? "none";
  if (weap === "high") {
    score += 70;
    reasons.push("weapon_high");
  } else if (weap === "medium") {
    score += 35;
    reasons.push("weapon_medium");
  } else if (weap === "low") {
    score += 10;
    reasons.push("weapon_low");
  }

  const fc = labels.faceCount ?? 0;
  if (fc > 1) {
    score += 25;
    reasons.push("multiple_faces");
  }

  if (photoSlot === 1) {
    const vis = labels.primaryFaceVisible;
    if (vis === false || fc === 0) {
      score += 50;
      reasons.push("face_not_visible_slot1");
    }
  }

  if (labels.spoofOrManipSuspicious) {
    score += 35;
    reasons.push("spoof_suspicious");
  }
  if (labels.textHeavyOrNonProfile) {
    score += 30;
    reasons.push("non_profile_image");
  }
  if (labels.lowQuality) {
    score += 20;
    reasons.push("low_quality");
  }

  score = clamp(Math.round(score), 0, 100);

  let band: DecisionBand;
  if (score >= 60) band = "rejected";
  else if (score >= 25) band = "pending_review";
  else band = "approved";

  // Swimwear / ambiguïté : si seul signal = nudité "medium" sans violence / arme / arme-like, ne pas auto-rejeter
  if (
    band === "rejected" &&
    reasons.length === 1 &&
    reasons[0] === "explicit_medium" &&
    viol === "none" &&
    weap === "none"
  ) {
    band = "pending_review";
  }

  const decisionReason = reasons.join(",") || "clean";

  const uiReasonCode = pickUiReasonCode(band, reasons, photoSlot);

  return { riskScore: score, band, decisionReason, uiReasonCode };
}

function pickUiReasonCode(
  band: DecisionBand,
  reasons: string[],
  photoSlot: number,
): string | undefined {
  if (band !== "rejected") return undefined;
  if (reasons.some((r) => r.startsWith("explicit"))) return "safety_rules";
  if (reasons.some((r) => r.startsWith("violence") || r.startsWith("weapon"))) return "safety_rules";
  if (reasons.includes("multiple_faces")) return "multiple_people";
  if (photoSlot === 1 && reasons.includes("face_not_visible_slot1")) return "face_not_visible";
  if (reasons.includes("non_profile_image")) return "irrelevant_photo";
  if (reasons.includes("spoof_suspicious")) return "heavy_filters";
  if (reasons.includes("low_quality")) return "heavy_filters";
  return "safety_rules";
}
