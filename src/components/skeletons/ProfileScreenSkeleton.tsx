import { SplovePageSkeletonFrame, SploveSkeletonBlock } from "./SkeletonPulse";

export function ProfileScreenSkeleton() {
  return (
    <SplovePageSkeletonFrame>
      <main className="mx-auto max-w-[420px] px-6 pb-28 pt-6">
        <SploveSkeletonBlock className="h-3 w-16" />
        <SploveSkeletonBlock className="mt-6 h-12 w-full rounded-2xl" />
        <SploveSkeletonBlock className="mt-4 h-12 w-full rounded-2xl" />
        <SploveSkeletonBlock className="mt-4 h-12 w-full rounded-2xl" />
        <div className="mt-6 rounded-[20px] border border-white/[0.06] bg-zinc-900/60 p-6">
          <SploveSkeletonBlock className="h-4 w-28" />
          <SploveSkeletonBlock className="mt-4 aspect-[3/4] w-full max-w-[220px] rounded-2xl" />
          <SploveSkeletonBlock className="mt-4 h-4 w-full" />
          <SploveSkeletonBlock className="mt-2 h-4 w-[85%]" />
        </div>
        <SploveSkeletonBlock className="mt-5 h-24 w-full rounded-2xl" />
        <SploveSkeletonBlock className="mt-5 h-32 w-full rounded-2xl" />
      </main>
    </SplovePageSkeletonFrame>
  );
}
