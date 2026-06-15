import { describe, expect, it } from "vitest";
import { publicAssetUrl } from "./publicAssetUrl";

describe("publicAssetUrl", () => {
  it("retourne un chemin absolu depuis la racine", () => {
    expect(publicAssetUrl("logo.png")).toBe("/logo.png");
    expect(publicAssetUrl("/logo.png")).toBe("/logo.png");
  });
});
