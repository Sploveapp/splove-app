import { VerifiedBadge } from "./VerifiedBadge";

type PremiumSuggestion = {
  id: string;
  photoUrl: string | null;
  firstName: string;
  age: number | null;
  commonSport: string;
  projectionCopy: string;
  /** Profil avec identité vérifiée (Veriff). */
  verified?: boolean;
};

type Props = {
  title?: string;
  subtitle?: string;
  items: PremiumSuggestion[];
  ctaLabel?: string;
  onCardCta?: (id: string) => void;
};

const FALLBACK = [
  "Disponible pour une sortie running dès cette semaine",
  "Même énergie : une session skate semble naturelle",
  "Bon contexte pour proposer un créneau concret rapidement",
];

export function PremiumSuggestionsSection({
  title = "Prêts à bouger cette semaine",
  subtitle = "Des profils compatibles pour une vraie rencontre par le sport.",
  items,
  ctaLabel = "Ouvrir la fiche",
  onCardCta,
}: Props) {
  return (
    <section className="rounded-3xl border border-app-border bg-app-card px-4 py-5 shadow-sm">
      <h3 className="text-base font-semibold text-app-text">{title}</h3>
      <p className="mt-1 text-sm text-app-muted">{subtitle}</p>

      <div className="mt-4 space-y-3">
        {items.slice(0, 3).map((item, index) => (
          <article
            key={item.id}
            className="flex items-start gap-3 rounded-2xl border border-app-border bg-app-bg/60 p-3"
          >
            {item.photoUrl ? (
              <img
                src={item.photoUrl}
                alt={item.firstName}
                className="h-16 w-16 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="h-16 w-16 shrink-0 rounded-xl bg-app-border" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-app-text">
                  {item.firstName}
                  {item.age ? `, ${item.age}` : ""}
                </p>
                {item.verified ? <VerifiedBadge variant="compact" /> : null}
              </div>
              <p className="mt-0.5 text-xs text-app-muted">Terrain commun : {item.commonSport}</p>
              <p className="mt-1 text-xs text-app-text">
                {item.projectionCopy || FALLBACK[index % FALLBACK.length]}
              </p>
              <button
                type="button"
                onClick={() => onCardCta?.(item.id)}
                className="mt-2 rounded-full border border-app-border bg-app-card px-3 py-1 text-[12px] font-semibold text-app-text"
              >
                {ctaLabel}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export type { PremiumSuggestion };
