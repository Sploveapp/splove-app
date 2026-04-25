import { BRAND_BG } from "../constants/theme";

export type SploveLogoSize = "small" | "medium" | "large";

const SIZE: Record<SploveLogoSize, { box: string; mark: string; text: string }> = {
  small: {
    box: "h-8 w-8",
    mark: "h-5 w-5",
    text: "text-base font-bold tracking-tight",
  },
  medium: {
    box: "h-9 w-9",
    mark: "h-7 w-7",
    text: "text-xl font-bold tracking-tight",
  },
  large: {
    box: "h-10 w-10",
    mark: "h-8 w-8 max-h-full max-w-full",
    text: "truncate text-2xl font-bold tracking-tight sm:text-3xl sm:tracking-tight",
  },
};

export type SploveLogoProps = {
  size?: SploveLogoSize;
  showText?: boolean;
  className?: string;
};

/**
 * Marque SPLove : uniquement `public/logo.png` (cœur + orbite) — un seul asset.
 */
export function SploveLogo({
  size = "medium",
  showText = false,
  className,
}: SploveLogoProps) {
  const s = SIZE[size];
  const mark = (
    <img
      src="/logo.png"
      alt={showText ? "" : "SPLove"}
      className={`${s.mark} object-contain`}
      loading="eager"
      decoding="async"
      draggable={false}
      aria-hidden={showText ? true : undefined}
    />
  );

  if (!showText) {
    if (className) {
      return <div className={className}>{mark}</div>;
    }
    return mark;
  }

  return (
    <div
      className={
        className
          ? `flex max-w-full items-center gap-2.5 ${className}`.trim()
          : "flex max-w-full items-center gap-2.5"
      }
    >
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-app-bg ring-1 ring-app-border ${s.box}`}
      >
        {mark}
      </div>
      <p className={s.text} style={{ color: BRAND_BG }}>
        SPLove
      </p>
    </div>
  );
}
