import { describe, expect, it } from "vitest";
import {
  PRACTICE_SCORE_GOOD,
  PRACTICE_SCORE_LOW,
  PRACTICE_SCORE_VERY_HIGH,
  practiceCompatibilityScore,
} from "./sportPracticeCompatibilityScore";

describe("practiceCompatibilityScore", () => {
  it("très bon : flexible + flexible ; adapted + flexible (symétrique)", () => {
    expect(practiceCompatibilityScore("flexible", "flexible")).toBe(PRACTICE_SCORE_VERY_HIGH);
    expect(practiceCompatibilityScore("adapted", "flexible")).toBe(PRACTICE_SCORE_VERY_HIGH);
    expect(practiceCompatibilityScore("flexible", "adapted")).toBe(PRACTICE_SCORE_VERY_HIGH);
  });

  it("bon : adapted + adapted, solo + solo, solo + flexible", () => {
    expect(practiceCompatibilityScore("adapted", "adapted")).toBe(PRACTICE_SCORE_GOOD);
    expect(practiceCompatibilityScore("solo", "solo")).toBe(PRACTICE_SCORE_GOOD);
    expect(practiceCompatibilityScore("solo", "flexible")).toBe(PRACTICE_SCORE_GOOD);
    expect(practiceCompatibilityScore("flexible", "solo")).toBe(PRACTICE_SCORE_GOOD);
  });

  it("faible : solo + adapted et valeurs absentes ou invalides", () => {
    expect(practiceCompatibilityScore("solo", "adapted")).toBe(PRACTICE_SCORE_LOW);
    expect(practiceCompatibilityScore("adapted", "solo")).toBe(PRACTICE_SCORE_LOW);
    expect(practiceCompatibilityScore(null, "flexible")).toBe(PRACTICE_SCORE_LOW);
    expect(practiceCompatibilityScore("solo", null)).toBe(PRACTICE_SCORE_LOW);
    expect(practiceCompatibilityScore("  ", "")).toBe(PRACTICE_SCORE_LOW);
  });

  it("insensible à la casse", () => {
    expect(practiceCompatibilityScore("Flexible", "ADAPTED")).toBe(PRACTICE_SCORE_VERY_HIGH);
  });
});
