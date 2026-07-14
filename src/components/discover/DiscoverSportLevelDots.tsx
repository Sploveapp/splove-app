import { memo } from "react";
import { sportPracticeLevelFilledCount } from "../../lib/sportPracticeLevel";
import type { SportPracticeLevel } from "../../lib/sportPracticeLevel";
import { sportEmojiHint } from "../../lib/chatActivity";
import { sportPictogramForSlug } from "../../lib/onboardingSportsQuickPick";
import { discoverSportAccentColor } from "../../lib/discoverSportAccentColor";

const EMPTY_DOT = "rgba(120,120,128,0.35)";

function sportEmojiForRow(slug: string | null | undefined, label: string): string {
  const slugEmoji = sportPictogramForSlug(slug);
  return slugEmoji !== "◆" ? slugEmoji : sportEmojiHint(label);
}

export type DiscoverSportLevelRowProps = {
  label: string;
  slug?: string | null;
  level: SportPracticeLevel | null;
  shared?: boolean;
};

export const DiscoverSportLevelRow = memo(function DiscoverSportLevelRow({
  label,
  slug,
  level,
}: DiscoverSportLevelRowProps) {
  const filled = sportPracticeLevelFilledCount(level);
  const accent = discoverSportAccentColor(slug, label);
  const pictogram = sportEmojiForRow(slug, label);

  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-app-text">
        <span className="shrink-0 text-base leading-none" aria-hidden>
          {pictogram}
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1" aria-hidden>
        {Array.from({ length: 5 }, (_, index) => (
          <span
            key={index}
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: index < filled ? accent : EMPTY_DOT }}
          />
        ))}
      </span>
    </div>
  );
});
