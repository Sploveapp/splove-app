import { SplovePageSkeletonFrame, SploveSkeletonBlock } from "./SkeletonPulse";

export function LikesListSkeleton() {
  return (
    <SplovePageSkeletonFrame>
      <main className="mx-auto max-w-md px-4 pb-8 pt-4">
        <SploveSkeletonBlock className="h-3 w-24" />
        <SploveSkeletonBlock className="mt-3 h-8 w-40" />
        <div className="mt-8 space-y-7">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="overflow-hidden rounded-[22px] border border-white/[0.06] bg-zinc-900/80"
            >
              <div className="relative aspect-[3/4] w-full bg-zinc-950">
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/90 via-zinc-700/40 to-zinc-900/95 splove-skeleton-breathe" />
                <div className="absolute bottom-4 left-4 right-4 space-y-2">
                  <SploveSkeletonBlock className="h-6 w-36 bg-white/14" />
                  <SploveSkeletonBlock className="h-4 w-48 bg-white/10" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </SplovePageSkeletonFrame>
  );
}
