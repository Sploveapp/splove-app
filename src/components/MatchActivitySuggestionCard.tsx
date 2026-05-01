import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import type { MatchActivitySuggestion, MatchActivitySuggestionTone } from "../lib/matchActivitySuggestion";

type Props = {
  suggestion: MatchActivitySuggestion;
  tone: MatchActivitySuggestionTone;
  /** Court libellé au-dessus du titre (ex. « À deux »). */
  sectionLabel: string;
  proposeLabel: string;
  chooseOtherLabel: string;
  onPropose: () => void;
  onChooseOther: () => void;
};

function toneCardClass(tone: MatchActivitySuggestionTone): string {
  switch (tone) {
    case "active":
      return "border-amber-400/35 bg-gradient-to-br from-amber-500/[0.12] via-app-card to-app-card ring-amber-400/25";
    case "adaptive":
      return "border-violet-400/30 bg-gradient-to-br from-violet-500/[0.1] via-app-card to-app-card ring-violet-400/20";
    default:
      return "border-white/16 bg-gradient-to-br from-white/[0.06] via-app-card to-app-card ring-white/10";
  }
}

/** Carte suggestion post-match — ton discret selon duo de pratiques. */
export function MatchActivitySuggestionCard({
  suggestion,
  tone,
  sectionLabel,
  proposeLabel,
  chooseOtherLabel,
  onPropose,
  onChooseOther,
}: Props) {
  return (
    <div
      className={`rounded-2xl border px-4 py-4 shadow-sm backdrop-blur-[2px] ${toneCardClass(tone)} ring-1`}
      role="region"
      aria-label={suggestion.title}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-app-muted">{sectionLabel}</p>
      <h2 className="mt-1.5 text-[1.05rem] font-bold leading-snug tracking-tight text-app-text">{suggestion.title}</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-app-muted">{suggestion.subtitle}</p>
      <div className="mt-4 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onPropose}
          className="w-full rounded-xl py-3 text-[14px] font-bold shadow-md transition hover:opacity-95 active:opacity-90"
          style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
        >
          {proposeLabel}
        </button>
        <button
          type="button"
          onClick={onChooseOther}
          className="w-full rounded-xl border border-app-border bg-app-card py-3 text-[14px] font-semibold text-app-text transition hover:bg-app-border"
        >
          {chooseOtherLabel}
        </button>
      </div>
    </div>
  );
}
