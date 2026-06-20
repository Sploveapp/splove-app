import { SplovePageSkeletonFrame, SploveSkeletonBlock } from "./SkeletonPulse";

export function MessagesListSkeleton() {
  return (
    <SplovePageSkeletonFrame>
      <main className="mx-auto max-w-md flex-1 px-4 pb-6 pt-2">
        <SploveSkeletonBlock className="h-3 w-20" />
        <SploveSkeletonBlock className="mt-2 h-7 w-44" />
        <SploveSkeletonBlock className="mt-2 h-4 w-56 max-w-full" />
        <ul className="mt-6 space-y-2.5" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <li
              key={i}
              className="flex min-h-[4.25rem] items-center gap-3 rounded-2xl border border-white/[0.06] bg-zinc-900/50 px-3.5 py-3.5"
            >
              <SploveSkeletonBlock className="h-[3.25rem] w-[3.25rem] shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <SploveSkeletonBlock className="h-4 w-[55%]" />
                <SploveSkeletonBlock className="h-3.5 w-[78%]" />
              </div>
            </li>
          ))}
        </ul>
      </main>
    </SplovePageSkeletonFrame>
  );
}
