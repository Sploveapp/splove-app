import { describe, expect, it } from "vitest";
import { discoverSportAccentColor } from "./discoverSportAccentColor";

describe("discoverSportAccentColor", () => {
  it("utilise la couleur canonique pour un slug connu", () => {
    expect(discoverSportAccentColor("randonnee", "Randonnée")).toBe("#4ade80");
    expect(discoverSportAccentColor("tennis", "Tennis")).toBe("#facc15");
    expect(discoverSportAccentColor("skate", "Skate")).toBe("#fb923c");
  });

  it("retombe sur l’heuristique libellé si le slug est absent", () => {
    expect(discoverSportAccentColor(null, "Course à pied")).toBe("#fb7185");
  });

  it("utilise l’accent SPLove par défaut", () => {
    expect(discoverSportAccentColor(null, "Sport inconnu")).toBe("#FF1E2D");
  });
});
