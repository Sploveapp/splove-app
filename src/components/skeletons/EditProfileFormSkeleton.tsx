import { SplovePageSkeletonFrame, SploveSkeletonBlock } from "./SkeletonPulse";

export function EditProfileFormSkeleton() {
  return (
    <SplovePageSkeletonFrame>
      <main className="mx-auto max-w-[560px] px-6 pb-28 pt-6">
        <SploveSkeletonBlock className="h-7 w-48" />
        <SploveSkeletonBlock className="mt-6 h-28 w-full rounded-2xl" />
        <SploveSkeletonBlock className="mt-4 h-36 w-full rounded-2xl" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <SploveSkeletonBlock className="aspect-[4/5] w-full rounded-xl" />
          <SploveSkeletonBlock className="aspect-[4/5] w-full rounded-xl" />
        </div>
        <SploveSkeletonBlock className="mt-4 h-11 w-full rounded-xl" />
        <SploveSkeletonBlock className="mt-4 h-24 w-full rounded-xl" />
        <SploveSkeletonBlock className="mt-6 h-12 w-full rounded-full" />
      </main>
    </SplovePageSkeletonFrame>
  );
}
