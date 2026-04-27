import { useProfilePhotoSignedUrl } from "../hooks/useProfilePhotoSignedUrl";

export type MeetingCardTab = "respond" | "upcoming" | "past";

export type MeetingCardProps = {
  tab: MeetingCardTab;
  sport: string;
  placeLabel: string;
  whenLabel: string;
  partnerFirstName: string | null;
  partnerPhotoUrl: string | null;
  statusLabel: string;
  badgeTone: "neutral" | "success" | "warning" | "danger" | "muted";
  busy?: boolean;
  onConfirm?: () => void;
  onDecline?: () => void;
  onCounter?: () => void;
  onOpenChat?: () => void;
  onCancel?: () => void;
  onRepropose?: () => void;
  onViewProfile?: () => void;
};

const BADGE_CLASS: Record<MeetingCardProps["badgeTone"], string> = {
  neutral: "bg-zinc-100 text-zinc-800 ring-zinc-200/80",
  success: "bg-emerald-50 text-emerald-900 ring-emerald-200/80",
  warning: "bg-amber-50 text-amber-900 ring-amber-200/80",
  danger: "bg-red-50 text-red-900 ring-red-200/80",
  muted: "bg-zinc-50 text-zinc-500 ring-zinc-200/60",
};

function PartnerAvatar({
  name,
  url,
}: {
  name: string;
  url: string | null;
}) {
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  const displayUrl = useProfilePhotoSignedUrl(url);
  if (url && url.length > 0) {
    return displayUrl ? (
      <img
        src={displayUrl}
        alt=""
        className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-1 ring-zinc-200"
      />
    ) : (
      <div
        className="h-14 w-14 shrink-0 rounded-2xl bg-zinc-100 ring-1 ring-zinc-200"
        aria-hidden
      />
    );
  }
  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-lg font-semibold text-zinc-600 ring-1 ring-zinc-200"
      aria-hidden
    >
      {initial}
    </div>
  );
}

export function MeetingCard({
  tab,
  sport,
  placeLabel,
  whenLabel,
  partnerFirstName,
  partnerPhotoUrl,
  statusLabel,
  badgeTone,
  busy = false,
  onConfirm,
  onDecline,
  onCounter,
  onOpenChat,
  onCancel,
  onRepropose,
  onViewProfile,
}: MeetingCardProps) {
  const displayName = partnerFirstName?.trim() || "Utilisateur";

  return (
    <article className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <PartnerAvatar name={displayName} url={partnerPhotoUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="truncate text-[17px] font-semibold leading-tight text-zinc-900">{displayName}</h2>
            <span
              className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${BADGE_CLASS[badgeTone]}`}
            >
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 text-[15px] font-medium text-zinc-800">{sport}</p>
          <p className="mt-0.5 text-[14px] text-zinc-600">{whenLabel}</p>
          <p className="mt-0.5 text-[13px] text-zinc-500">{placeLabel}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-zinc-100 pt-4">
        {tab === "respond" && (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className="min-h-[44px] flex-1 rounded-xl bg-zinc-900 py-2.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50"
              >
                Confirmer
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onCounter}
                className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-[15px] font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50"
              >
                Proposer un autre créneau
              </button>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onDecline}
              className="w-full rounded-xl border border-transparent py-2 text-[14px] font-medium text-zinc-500 underline-offset-2 hover:underline disabled:opacity-50"
            >
              Refuser
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onOpenChat}
              className="w-full py-1.5 text-center text-[13px] font-medium text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline disabled:opacity-50"
            >
              Voir le chat
            </button>
          </>
        )}

        {tab === "upcoming" && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={busy}
              onClick={onOpenChat}
              className="min-h-[44px] flex-1 rounded-xl bg-zinc-900 py-2.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50"
            >
              Voir le chat
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-[14px] font-medium text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              Annuler
            </button>
          </div>
        )}

        {tab === "past" && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={busy}
              onClick={onRepropose}
              className="min-h-[44px] flex-1 rounded-xl bg-zinc-900 py-2.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50"
            >
              Reproposer une activité
            </button>
            {onViewProfile ? (
              <button
                type="button"
                disabled={busy}
                onClick={onViewProfile}
                className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-[15px] font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50"
              >
                Voir le profil
              </button>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}
