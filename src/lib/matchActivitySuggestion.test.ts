import { describe, expect, it } from "vitest";
import { classifyMatchActivityScenario } from "./matchActivitySuggestion";

describe("classifyMatchActivityScenario", () => {
  it("prioritise toute présence de profil « adapted »", () => {
    expect(classifyMatchActivityScenario("adapted", "solo")).toBe("adapted");
    expect(classifyMatchActivityScenario("flexible", "adapted")).toBe("adapted");
  });

  it("duo flexible → dual_flexible ; duo solo → dual_solo", () => {
    expect(classifyMatchActivityScenario("flexible", "flexible")).toBe("dual_flexible");
    expect(classifyMatchActivityScenario("solo", "solo")).toBe("dual_solo");
  });

  it("combinaisons hors matrice prioritaire → fallback", () => {
    expect(classifyMatchActivityScenario("solo", "flexible")).toBe("fallback");
    expect(classifyMatchActivityScenario(null, null)).toBe("fallback");
    expect(classifyMatchActivityScenario("solo", null)).toBe("fallback");
  });
});
