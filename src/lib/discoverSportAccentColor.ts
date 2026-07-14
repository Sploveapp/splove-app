/**
 * Couleur d’accent UI pour les points de niveau sport sur la carte Discover.
 * Heuristique slug / libellé — affichage uniquement.
 */

const SLUG_ACCENT: Record<string, string> = {
  randonnee: "#4ade80",
  "marche-randonnee": "#4ade80",
  marche: "#4ade80",
  "course-a-pied": "#fb7185",
  tennis: "#facc15",
  padel: "#facc15",
  skate: "#fb923c",
  fitness: "#c084fc",
  musculation: "#c084fc",
  "fitness-musculation": "#c084fc",
  velo: "#38bdf8",
  natation: "#22d3ee",
  football: "#86efac",
  petanque: "#fcd34d",
};

const LABEL_HINTS: { patterns: string[]; color: string }[] = [
  { patterns: ["rando", "trail", "hik", "marche"], color: "#4ade80" },
  { patterns: ["run", "course", "jogg"], color: "#fb7185" },
  { patterns: ["tennis", "padel"], color: "#facc15" },
  { patterns: ["skate", "surf"], color: "#fb923c" },
  { patterns: ["muscu", "fitness", "crossfit"], color: "#c084fc" },
  { patterns: ["vélo", "velo", "cycl", "vtt"], color: "#38bdf8" },
  { patterns: ["natation", "swim", "piscine"], color: "#22d3ee" },
  { patterns: ["foot", "futsal"], color: "#86efac" },
  { patterns: ["basket"], color: "#f97316" },
  { patterns: ["yoga", "pilates"], color: "#a78bfa" },
];

const DEFAULT_ACCENT = "#FF1E2D";

export function discoverSportAccentColor(
  slug: string | null | undefined,
  label: string | null | undefined,
): string {
  const s = (slug ?? "").trim().toLowerCase();
  if (s && SLUG_ACCENT[s]) return SLUG_ACCENT[s];

  const lab = (label ?? "").trim().toLowerCase();
  for (const { patterns, color } of LABEL_HINTS) {
    if (patterns.some((p) => lab.includes(p))) return color;
  }

  return DEFAULT_ACCENT;
}
