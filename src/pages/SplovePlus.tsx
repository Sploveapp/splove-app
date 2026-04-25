import React, { useEffect, useState } from "react";

export default function SplovePlus() {
  const isBetaTester = true;
  const [isSplovePlusActive, setIsSplovePlusActive] = useState(false);
  const [isGhostModeOn, setIsGhostModeOn] = useState(false);
  const [boostModalOpen, setBoostModalOpen] = useState(false);
  const [placesModalOpen, setPlacesModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [microBoostModalOpen, setMicroBoostModalOpen] = useState(false);
  const [microGhostActive, setMicroGhostActive] = useState(false);
  const [microPriorityActive, setMicroPriorityActive] = useState(false);
  const [microPlacesActive, setMicroPlacesActive] = useState(false);
  const [microReminderActive, setMicroReminderActive] = useState(false);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  function showToast(message: string) {
    setToastMessage(message);
  }

  function activateBoost(duration: "30 min" | "1h") {
    setBoostModalOpen(false);
    showToast(`Boost activé pendant ${duration} 🚀`);
  }

  function activateMicroOption(type: "ghost" | "priority" | "places" | "reminder") {
    showToast("Option offerte pendant la bêta 🎁");
    if (type === "ghost") setMicroGhostActive(true);
    if (type === "priority") setMicroPriorityActive(true);
    if (type === "places") setMicroPlacesActive(true);
    if (type === "reminder") setMicroReminderActive(true);
  }

  return (
    <main className="min-h-screen bg-[#0B0B0F] px-5 py-6 text-white">
      <section className="mx-auto max-w-md space-y-6">
        <header className="space-y-3 pt-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#FF3B3B]/30 bg-[#FF3B3B]/15">
            <span className="text-3xl">⚡</span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight">Passe du match au réel.</h1>

          <p className="leading-relaxed text-white/70">
            Moins de discussion inutile. Plus de vraies rencontres.
          </p>
        </header>

        {isBetaTester && (
          <div className="rounded-3xl border border-[#FF3B3B]/30 bg-[#FF3B3B]/10 p-4 text-center">
            <p className="text-sm font-medium text-[#FF6B6B]">Offert pendant la bêta 🎁</p>
            <p className="mt-1 text-xs text-white/60">Accès anticipé — sans engagement</p>
          </div>
        )}

        <section className="grid gap-3">
          <FeatureCard
            icon="🚀"
            title="Boost visibilité"
            text="Sois vu par les profils compatibles au moment où ils sont actifs."
            actionLabel="Activer"
            onClick={() => setBoostModalOpen(true)}
          />
          <FeatureCard
            icon="👻"
            title="Mode Fantôme"
            text="Explore librement sans être vu. Tu apparais uniquement quand il y a un vrai match."
            actionLabel={isGhostModeOn ? "Désactiver" : "Activer"}
            onClick={() => {
              const next = !isGhostModeOn;
              setIsGhostModeOn(next);
              if (next) showToast("Mode Fantôme activé 👻");
            }}
            statusLine={isGhostModeOn ? "Mode Fantôme activé 👻" : null}
          />
          <FeatureCard
            icon="⚡"
            title="Proposition prioritaire"
            text="Ta proposition d’activité passe en priorité. Plus de chances d’avoir une réponse."
            actionLabel="Activer"
            onClick={() => showToast("Ta prochaine proposition sera prioritaire ⚡")}
          />
          <FeatureCard
            icon="📍"
            title="Lieux communs"
            text="Découvre les endroits où vous pourriez vraiment vous rencontrer."
            actionLabel="Découvrir"
            onClick={() => setPlacesModalOpen(true)}
          />
          <FeatureCard
            icon="🔔"
            title="Rappel intelligent"
            text="Un petit coup de pouce pour ne pas laisser passer une vraie opportunité."
            actionLabel="Activer"
            onClick={() => showToast("Rappels intelligents activés 🔔")}
          />
        </section>

        <section className="grid gap-3">
          <FeatureCard
            icon="🎯"
            title="Mode rencontre active"
            text="Passe en priorité quand tu cherches une rencontre en ce moment."
            actionLabel="Nouveau"
            onClick={() => showToast("Active ce mode depuis ton profil.")}
          />
          <FeatureCard
            icon="🛡️"
            title="Fiabilité visible"
            text="Affiche un niveau de fiabilité High, Medium ou Low sur les profils."
            actionLabel="Nouveau"
            onClick={() => showToast("Le badge fiabilité est désormais visible.")}
          />
          <FeatureCard
            icon="🕒"
            title="Créneaux intelligents"
            text="Suggestions automatiques de créneaux quand vos disponibilités se chevauchent."
            actionLabel="Nouveau"
            onClick={() => showToast("Suggestions de créneaux activées dans le chat.")}
          />
        </section>

        <section className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm text-white/50">Après la bêta</p>
              <p className="text-2xl font-semibold">9,99€ / mois</p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">
              Sans engagement
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!isSplovePlusActive) {
                setIsSplovePlusActive(true);
                showToast("Bienvenue dans SPLove+ bêta 🎁");
              }
            }}
            className={`w-full rounded-2xl py-4 font-semibold transition active:scale-[0.98] ${
              isSplovePlusActive ? "bg-emerald-500/80" : "bg-[#FF3B3B]"
            }`}
          >
            {isSplovePlusActive ? "SPLove+ activé" : "Activer gratuitement"}
          </button>

          <p className="text-center text-xs text-white/45">
            Les likes, le chat et Qui m’a liké restent gratuits.
          </p>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div>
            <p className="text-base font-semibold text-white">T’envie de tester une seule option ?</p>
          </div>

          <MicroPurchaseCard
            title="Boost visibilité"
            price="1,99€"
            details="Choix 30 min ou 1h"
            ctaLabel="Choisir"
            onClick={() => setMicroBoostModalOpen(true)}
          />
          <MicroPurchaseCard
            title="Mode Fantôme"
            price="1,99€"
            details="Durée 24h"
            ctaLabel="Activer"
            onClick={() => activateMicroOption("ghost")}
            statusLine={microGhostActive ? "Activé en bêta" : null}
          />
          <MicroPurchaseCard
            title="Proposition prioritaire"
            price="1,99€"
            details="Valable sur la prochaine proposition d’activité"
            ctaLabel="Prioriser"
            onClick={() => activateMicroOption("priority")}
            statusLine={microPriorityActive ? "Priorité activée en bêta" : null}
          />
          <MicroPurchaseCard
            title="Lieux communs"
            price="1,99€"
            details="Accès 24h aux spots/lieux communs"
            ctaLabel="Découvrir"
            onClick={() => {
              activateMicroOption("places");
              setPlacesModalOpen(true);
            }}
            statusLine={microPlacesActive ? "Accès activé en bêta" : null}
          />
          <MicroPurchaseCard
            title="Rappel intelligent"
            price="1,99€"
            details="Rappel avant expiration des 48h"
            ctaLabel="Activer"
            onClick={() => activateMicroOption("reminder")}
            statusLine={microReminderActive ? "Rappel activé en bêta" : null}
          />
        </section>

        <section className="space-y-3 rounded-3xl bg-white/[0.03] p-4">
          <p className="text-sm leading-relaxed text-white/65">
            SPLove+ sert à accélérer les vraies rencontres.
          </p>
          <p className="text-sm leading-relaxed text-white/65">
            SPLove+ ne bloque pas les rencontres. Il accélère les moments où vous pouvez vraiment
            passer au réel.
          </p>
          <p className="text-sm leading-relaxed text-white/65">
            Ici, on ne swipe pas pendant des semaines. On se rencontre.
          </p>
        </section>
      </section>

      {boostModalOpen ? (
        <ModalShell title="Boost visibilité" onClose={() => setBoostModalOpen(false)}>
          <p className="text-sm leading-relaxed text-white/70">
            Choisis la durée pour mettre ton profil en avant maintenant.
          </p>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={() => activateBoost("30 min")}
              className="w-full rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-semibold transition hover:bg-white/10"
            >
              Boost 30 min
            </button>
            <button
              type="button"
              onClick={() => activateBoost("1h")}
              className="w-full rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-semibold transition hover:bg-white/10"
            >
              Boost 1h
            </button>
          </div>
        </ModalShell>
      ) : null}

      {placesModalOpen ? (
        <ModalShell title="Lieux communs" onClose={() => setPlacesModalOpen(false)}>
          <p className="text-sm leading-relaxed text-white/70">
            Bientôt : découvre les spots sportifs que vous avez en commun.
          </p>
        </ModalShell>
      ) : null}

      {microBoostModalOpen ? (
        <ModalShell title="Boost visibilité (option ponctuelle)" onClose={() => setMicroBoostModalOpen(false)}>
          <p className="text-sm leading-relaxed text-white/70">
            Option offerte pendant la bêta 🎁 Choisis la durée puis active le boost.
          </p>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={() => {
                setMicroBoostModalOpen(false);
                showToast("Option offerte pendant la bêta 🎁");
                window.setTimeout(() => showToast("Boost activé pendant 30 min 🚀"), 300);
              }}
              className="w-full rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-semibold transition hover:bg-white/10"
            >
              Boost 30 min
            </button>
            <button
              type="button"
              onClick={() => {
                setMicroBoostModalOpen(false);
                showToast("Option offerte pendant la bêta 🎁");
                window.setTimeout(() => showToast("Boost activé pendant 1h 🚀"), 300);
              }}
              className="w-full rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-semibold transition hover:bg-white/10"
            >
              Boost 1h
            </button>
          </div>
        </ModalShell>
      ) : null}

      {toastMessage ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#15151D] px-4 py-3 text-center text-sm font-medium text-white shadow-2xl">
            {toastMessage}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function MicroPurchaseCard({
  title,
  price,
  details,
  ctaLabel,
  onClick,
  statusLine = null,
}: {
  title: string;
  price: string;
  details: string;
  ctaLabel: string;
  onClick: () => void;
  statusLine?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-0.5 text-xs text-white/55">{details}</p>
          <p className="mt-1 text-sm font-semibold text-[#FF8B8B]">{price}</p>
        </div>
        <button
          type="button"
          onClick={onClick}
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
        >
          {ctaLabel}
        </button>
      </div>
      {statusLine ? <p className="mt-2 text-xs text-emerald-300">{statusLine}</p> : null}
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  text,
  actionLabel,
  onClick,
  statusLine = null,
}: {
  icon: string;
  title: string;
  text: string;
  actionLabel: string;
  onClick: () => void;
  statusLine?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.07]"
    >
      <div className="flex gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-xl">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-white/60">{text}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-[#FF7B7B]">{actionLabel}</span>
        </div>
        {statusLine ? <p className="mt-2 text-xs text-emerald-300">{statusLine}</p> : null}
      </div>
      </div>
    </button>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 px-4 pb-4 pt-10 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111117] p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/70 transition hover:bg-white/10"
          >
            Fermer
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
