import { describe, expect, it } from "vitest";
import { getDiscoverSportChips } from "./sportMatchGroups";

describe("getDiscoverSportChips", () => {
  it("affiche le libellé sport et le niveau réel depuis profile_sports.level", () => {
    const chips = getDiscoverSportChips(
      {
        profile_sports: [
          {
            level: "intermediate",
            sports: { label: "Randonnée", slug: "randonnee" },
          },
          {
            level: "intermediate",
            sports: { label: "Tennis", slug: "tennis" },
          },
          {
            level: "intermediate",
            sports: { label: "Skate", slug: "skate" },
          },
        ],
      },
      new Set(["g:walk-hike"]),
    );

    expect(chips).toHaveLength(3);
    expect(chips.find((c) => c.label === "Randonnée")).toMatchObject({
      level: "intermediate",
      levelKey: "sport_practice_level_intermediate",
      shared: true,
    });
    expect(chips.find((c) => c.label === "Tennis")).toMatchObject({
      level: "intermediate",
      levelKey: "sport_practice_level_intermediate",
      shared: false,
    });
    expect(chips.find((c) => c.label === "Skate")).toMatchObject({
      level: "intermediate",
      shared: false,
    });
  });

  it("n’invente pas de niveau si level est absent", () => {
    const chips = getDiscoverSportChips(
      {
        profile_sports: [{ level: null, sports: { label: "Fitness", slug: "fitness" } }],
      },
      new Set(),
    );
    expect(chips[0]).toMatchObject({
      label: "Fitness",
      level: null,
      levelKey: null,
    });
  });
});
