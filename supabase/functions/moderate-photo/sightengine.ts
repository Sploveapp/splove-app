import type { NormalizedModerationLabels } from "./risk.ts";

type SightNudity = Record<string, number>;
type SightWeapon = Record<string, number>;

function levelFromScores(scores: Record<string, number> | undefined): "none" | "low" | "medium" | "high" {
  if (!scores || typeof scores !== "object") return "none";
  const vals = Object.values(scores).filter((v) => typeof v === "number") as number[];
  const max = vals.length ? Math.max(...vals) : 0;
  if (max >= 0.85) return "high";
  if (max >= 0.55) return "medium";
  if (max >= 0.25) return "low";
  return "none";
}

function nudityExplicitLevel(n: SightNudity | undefined): "none" | "low" | "medium" | "high" {
  if (!n || typeof n !== "object") return "none";
  const sexual = Math.max(
    Number(n.sexual_activity ?? 0),
    Number(n.sexual_display ?? 0),
    Number(n.erotica ?? 0),
    Number(n.very_suggestive ?? 0),
  );
  const suggestive = Number(n.suggestive ?? 0);
  const swim = Math.max(Number(n.swimwear_male ?? 0), Number(n.swimwear_female ?? 0));
  const none = Number(n.none ?? 1);
  void none;
  if (sexual >= 0.75) return "high";
  if (sexual >= 0.45 || suggestive >= 0.72) return "medium";
  if (sexual >= 0.2 || suggestive >= 0.45) return "low";
  if (swim >= 0.9 && sexual < 0.15) return "low";
  return "none";
}

export function labelsFromSightengineJson(raw: unknown, photoSlot: number): NormalizedModerationLabels {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const nudity = o.nudity as SightNudity | undefined;
  const weapon = o.weapon as SightWeapon | undefined;
  const violenceRaw = o.violence as Record<string, unknown> | undefined;
  const faces = Array.isArray(o.faces) ? (o.faces as unknown[]) : [];
  const type = (o.type as Record<string, number> | undefined) ?? undefined;
  const quality = (o.quality as Record<string, unknown> | undefined) ?? undefined;

  const explicitNudity = nudityExplicitLevel(nudity);
  const weaponLvl = levelFromScores(weapon);
  let violenceProb = 0;
  if (violenceRaw && typeof violenceRaw.probability === "number") {
    violenceProb = violenceRaw.probability;
  } else if (violenceRaw) {
    const { probability: _p, ...rest } = violenceRaw;
    void _p;
    const nums = Object.values(rest).filter((v): v is number => typeof v === "number");
    violenceProb = nums.length > 0 ? Math.max(0, ...nums) : 0;
  }
  const violenceLvl: "none" | "low" | "medium" | "high" =
    violenceProb >= 0.85 ? "high" : violenceProb >= 0.55 ? "medium" : violenceProb >= 0.25 ? "low" : "none";

  const faceCount = faces.length;
  let primaryFaceVisible = faceCount >= 1;
  if (photoSlot === 1 && faceCount === 1) {
    const f0 = faces[0] as { attributes?: { minor?: number } };
    const conf = (faces[0] as { confidence?: number })?.confidence;
    if (typeof conf === "number" && conf < 0.55) primaryFaceVisible = false;
    if (f0?.attributes && typeof f0.attributes.minor === "number" && f0.attributes.minor > 0.65) {
      /* mineur apparent : traité côté score via autre signal ; visage peut rester "visible" */
    }
  }
  if (photoSlot === 1 && faceCount === 0) primaryFaceVisible = false;

  const ai = type ? Math.max(Number(type.ai_generated ?? 0), Number(type.minor ?? 0)) : 0;
  const spoofOrManipSuspicious = ai >= 0.45;

  const props = o.properties as Record<string, unknown> | undefined;
  const textHeavyOrNonProfile =
    (props && String(props.screenshot ?? "") === "true") ||
    (type && Math.max(Number(type.physical ?? 0), Number(type.object ?? 0)) >= 0.65 && faceCount === 0);

  const lowQuality =
    quality &&
    (Number(quality.score ?? 1) < 0.35 || String(quality.artifacts ?? "") === "high");

  return {
    explicitNudity,
    weapon: weaponLvl,
    violence: violenceLvl,
    faceCount,
    primaryFaceVisible,
    spoofOrManipSuspicious,
    textHeavyOrNonProfile: !!textHeavyOrNonProfile,
    lowQuality: !!lowQuality,
  };
}

export async function callSightengine(
  bytes: Uint8Array,
  mime: string,
  apiUser: string,
  apiSecret: string,
): Promise<unknown> {
  const form = new FormData();
  form.append("api_user", apiUser);
  form.append("api_secret", apiSecret);
  form.append("models", "nudity-2.0,weapon,offensive-2.0,type,faces,properties,quality");
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  form.append("media", new Blob([bytes], { type: mime || "image/jpeg" }), `upload.${ext}`);

  const res = await fetch("https://api.sightengine.com/1.0/check.json", {
    method: "POST",
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof json?.error === "string" ? json.error : `sightengine_http_${res.status}`);
  }
  if (json?.status === "failure") {
    throw new Error(String(json?.error?.message ?? "sightengine_failure"));
  }
  return json;
}
