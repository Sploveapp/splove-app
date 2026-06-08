/**
 * Placeholder Move/Discover — aucun profil réel, aucune action like/pass.
 * Affiché tant que le feed n’est pas prêt (scoring / filtrage / ranking terminés).
 */
export function MoveProfileSkeleton({ immersive = false }: { immersive?: boolean }) {
  return (
    <article
      className={`flex flex-col overflow-hidden rounded-[26px] bg-app-card ring-1 ring-white/[0.06] ${
        immersive
          ? "min-h-[min(76dvh,calc(100dvh-10rem))] max-h-[calc(100dvh-5.5rem)] w-full flex-1 shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
          : "mb-8 max-h-[min(92vh,840px)] min-h-[min(560px,88svh)] shadow-lg ring-app-border/90"
      }`}
      aria-hidden
      aria-busy="true"
    >
      <div
        className={`relative w-full flex-1 basis-0 overflow-hidden bg-zinc-950 ${
          immersive ? "min-h-[min(68dvh,600px)]" : "min-h-[min(58vh,420px)] sm:min-h-[min(52vh,480px)]"
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/95 via-zinc-700/45 to-zinc-900/95 splove-skeleton-breathe" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[10] pb-28 pt-12">
          <div className="flex flex-wrap gap-1.5 px-4">
            <div className="h-5 w-[4.25rem] rounded-full bg-white/12" />
            <div className="h-5 w-[5.5rem] rounded-full bg-white/10" />
          </div>
          <div className="mt-3 space-y-2 px-4">
            <div className="h-10 w-[65%] max-w-[13rem] rounded-lg bg-white/14" />
            <div className="h-4 w-[72%] max-w-[14rem] rounded-md bg-emerald-400/25" />
            <div className="h-3.5 w-[88%] max-w-[18rem] rounded-md bg-white/10" />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[11] flex items-center justify-between px-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="h-14 w-14 shrink-0 rounded-full bg-white/12 splove-skeleton-breathe" />
          <div className="h-12 w-12 shrink-0 rounded-full bg-white/10 splove-skeleton-breathe" />
          <div className="h-[3.65rem] w-[3.65rem] shrink-0 rounded-full bg-white/14 splove-skeleton-breathe" />
        </div>
      </div>
      {!immersive ? (
        <div className="border-t border-app-border/85 bg-app-card px-3 py-2.5">
          <div className="mx-auto h-3 w-28 rounded-md bg-app-border/80 splove-skeleton-breathe" />
        </div>
      ) : null}
    </article>
  );
}
