import type { CSSProperties, ReactNode } from "react";

const SHELL_BG = "#0B0B0F";

export function SploveSkeletonBlock({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`rounded-xl bg-white/10 splove-skeleton-breathe ${className}`.trim()}
      style={style}
      aria-hidden
    />
  );
}

export function SplovePageSkeletonFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-h-[100dvh] w-full bg-[#0B0B0F] ${className}`.trim()}
      style={{ backgroundColor: SHELL_BG }}
      aria-busy="true"
      aria-live="polite"
    >
      {children}
    </div>
  );
}
