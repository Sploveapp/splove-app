type Props = {
  remainingMinutes: number;
  onViewImpact?: () => void;
  onExtend?: () => void;
};

export function BoostActiveStatus({ remainingMinutes, onViewImpact, onExtend }: Props) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 ring-1 ring-emerald-100/60">
      <p className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
        Actif maintenant
      </p>
      <p className="mt-2 text-sm text-emerald-900/90">
        Votre presence est boostee pendant encore {remainingMinutes} min
      </p>
      <div className="mt-2 flex gap-2">
        {onViewImpact ? (
          <button
            type="button"
            onClick={onViewImpact}
            className="rounded-full border border-emerald-200 bg-app-card px-3 py-1 text-[12px] font-semibold text-emerald-800"
          >
            Voir mon impact
          </button>
        ) : null}
        {onExtend ? (
          <button
            type="button"
            onClick={onExtend}
            className="rounded-full border border-emerald-200 bg-app-card px-3 py-1 text-[12px] font-semibold text-emerald-800"
          >
            Prolonger
          </button>
        ) : null}
      </div>
    </div>
  );
}
