import { useEffect, useState } from "react";
import { useTranslation } from "../i18n/useTranslation";
import { useSplovePlus } from "../hooks/useSplovePlus";
import { useAuth } from "../contexts/AuthContext";

const BETA_METRICS_KEY = "splove_plus_beta_metrics";

type BetaMetrics = {
  paywallViews: number;
  ctaClicks: number;
  activations: number;
  featureUsage: Record<string, number>;
};

type ModalId = "boost" | "ghost" | "priority" | "places" | "reminder" | null;

function readBetaMetrics(): BetaMetrics {
  try {
    const raw = localStorage.getItem(BETA_METRICS_KEY);
    if (!raw) {
      return { paywallViews: 0, ctaClicks: 0, activations: 0, featureUsage: {} };
    }
    const parsed = JSON.parse(raw) as Partial<BetaMetrics>;
    return {
      paywallViews: Number(parsed.paywallViews ?? 0),
      ctaClicks: Number(parsed.ctaClicks ?? 0),
      activations: Number(parsed.activations ?? 0),
      featureUsage: parsed.featureUsage && typeof parsed.featureUsage === "object" ? parsed.featureUsage : {},
    };
  } catch {
    return { paywallViews: 0, ctaClicks: 0, activations: 0, featureUsage: {} };
  }
}

function writeBetaMetrics(metrics: BetaMetrics) {
  try {
    localStorage.setItem(BETA_METRICS_KEY, JSON.stringify(metrics));
  } catch {
    // ignore storage write failures
  }
}

function trackBetaEvent(eventName: "paywall_view" | "cta_click" | "activation" | "feature_usage", featureKey?: string) {
  const current = readBetaMetrics();
  if (eventName === "paywall_view") current.paywallViews += 1;
  if (eventName === "cta_click") current.ctaClicks += 1;
  if (eventName === "activation") current.activations += 1;
  if (eventName === "feature_usage") {
    const key = (featureKey ?? "unknown").trim() || "unknown";
    current.featureUsage[key] = (current.featureUsage[key] ?? 0) + 1;
  }
  writeBetaMetrics(current);
  const activationRate = current.ctaClicks > 0 ? Number(((current.activations / current.ctaClicks) * 100).toFixed(1)) : 0;
  console.info("[SPLove+ beta metrics]", {
    eventName,
    featureKey: featureKey ?? null,
    paywallViews: current.paywallViews,
    ctaClicks: current.ctaClicks,
    activations: current.activations,
    activationRatePercent: activationRate,
    featureUsage: current.featureUsage,
  });
}

export default function SplovePlus() {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalId>(null);
  const [boostDuration, setBoostDuration] = useState<"30" | "60">("30");
  const {
    isActive,
    activate,
    isPriorityEnabled,
    isGhostEnabled,
    isPlacesEnabled,
    isRemindersEnabled,
    isBoostEnabled,
    isOneShotBoostActive,
    oneShotBoostDuration,
    isOneShotGhostActive,
    isOneShotPriorityActive,
    isOneShotPlacesActive,
    isOneShotReminderActive,
    togglePriority,
    toggleGhost,
    togglePlaces,
    toggleReminders,
    toggleBoost,
    activateOneShotBoost,
    activateOneShotGhost,
    activateOneShotPriority,
    activateOneShotPlaces,
    activateOneShotReminder,
  } = useSplovePlus(user?.id ?? null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    trackBetaEvent("paywall_view");
  }, []);

  function handlePrimaryCta() {
    trackBetaEvent("cta_click");
    if (isActive) return;
    trackBetaEvent("activation");
    activate();
    setToastMessage(t("splove_plus_activation_value"));
  }

  function openOneShot(kind: NonNullable<ModalId>, already: boolean) {
    if (already) {
      setToastMessage(t("one_shot_activated"));
      return;
    }
    if (kind === "boost") setBoostDuration(oneShotBoostDuration === "60" ? "60" : "30");
    setModal(kind);
  }

  function confirmOneShot() {
    if (!modal) return;
    if (modal === "boost") activateOneShotBoost(boostDuration);
    if (modal === "ghost") activateOneShotGhost();
    if (modal === "priority") activateOneShotPriority();
    if (modal === "places") activateOneShotPlaces();
    if (modal === "reminder") activateOneShotReminder();
    setModal(null);
    if (modal === "boost") {
      setToastMessage(
        language === "en"
          ? boostDuration === "60"
            ? "You're now boosted for 1 hour"
            : "You're now boosted for 30 minutes"
          : boostDuration === "60"
            ? "Tu es booste pendant 1 heure"
            : "Tu es booste pendant 30 minutes",
      );
      return;
    }
    setToastMessage(t("one_shot_activated"));
  }

  const heroP =
    language === "en"
      ? "SPLove+ accelerates what really matters: meeting in real life."
      : "SPLove+ accelere ce qui compte vraiment : se voir en vrai.";

  return (
    <main className="min-h-screen bg-[#0B0B0F] px-4 pb-28 pt-6 text-white">
      <section className="mx-auto max-w-md space-y-6">
        <header className="space-y-4 text-center">
          <div className="mx-auto inline-flex rounded-full border border-[#FF3B3B]/35 bg-[#FF3B3B]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#FF7A7A]">
            SPLove+
          </div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            {t("premium_tagline")}
          </h1>
          <p className="text-sm leading-relaxed text-white/70">{heroP}</p>
          <p className="mx-auto inline-flex rounded-full border border-[#FF3B3B]/30 bg-[#FF3B3B]/10 px-3 py-1 text-xs font-medium text-[#FF9B9B]">
            {language === "en"
              ? "🧪 Beta access active - SPLove+ temporarily free"
              : "🧪 Acces beta actif - SPLove+ offert temporairement"}
          </p>
          <button
            type="button"
            onClick={handlePrimaryCta}
            disabled={isActive}
            className="w-full rounded-2xl bg-[#FF3B3B] px-4 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_30px_rgba(255,59,59,0.25)] transition duration-200 hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isActive ? t("splove_plus_status_active") : t("premium_cta")}
          </button>
          <p className="text-xs font-medium text-[#FF9B9B]">
            {language === "en" ? "+3x more activity proposals accepted" : "+3x plus de propositions acceptees"}
          </p>
          {isActive ? (
            <p className="text-xs font-medium text-emerald-300/95">{t("splove_plus_status_active")}</p>
          ) : null}
          {isGhostEnabled ? (
            <p className="mx-auto max-w-md rounded-xl border border-violet-400/35 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-100">
              {language === "en"
                ? "Ghost Mode is on - your profile is hidden from Discover."
                : "Mode fantome actif - ton profil est invisible dans Decouvrir."}
            </p>
          ) : null}
        </header>

        {isActive ? (
          <section
            className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4"
            aria-label={t("premium_included_options")}
          >
            <h2 className="text-base font-semibold text-white">{t("premium_included_options")}</h2>
            <ToggleRow
              label={t("premium_feature_2")}
              activeWord={t("active")}
              activateLabel={t("activate")}
              deactivateLabel={t("deactivate")}
              active={isPriorityEnabled}
              onToggle={() => {
                togglePriority();
                trackBetaEvent("feature_usage", "incl_priority");
              }}
            />
            <ToggleRow
              label={t("one_shot_ghost")}
              active={isGhostEnabled}
              activeWord={t("active")}
              activateLabel={t("activate")}
              deactivateLabel={t("deactivate")}
              onToggle={() => {
                toggleGhost();
                trackBetaEvent("feature_usage", "incl_ghost");
              }}
            />
            <ToggleRow
              label={t("premium_feature_3")}
              active={isPlacesEnabled}
              activeWord={t("active")}
              activateLabel={t("activate")}
              deactivateLabel={t("deactivate")}
              onToggle={() => {
                togglePlaces();
                trackBetaEvent("feature_usage", "incl_places");
              }}
            />
            <ToggleRow
              label={t("one_shot_smart_reminder")}
              active={isRemindersEnabled}
              activeWord={t("active")}
              activateLabel={t("activate")}
              deactivateLabel={t("deactivate")}
              onToggle={() => {
                toggleReminders();
                trackBetaEvent("feature_usage", "incl_reminders");
              }}
            />
            <ToggleRow
              label={t("premium_feature_4")}
              active={isBoostEnabled}
              activeWord={t("active")}
              activateLabel={t("activate")}
              deactivateLabel={t("deactivate")}
              onToggle={() => {
                toggleBoost();
                trackBetaEvent("feature_usage", "incl_smart_boost");
              }}
            />
          </section>
        ) : null}

        <section className="space-y-3">
          <BenefitCard
            icon="⚡"
            title={t("premium_feature_2")}
            text={
              language === "en"
                ? "Your activity suggestions are shown first to turn a match into a real plan."
                : "Tes propositions arrivent en priorité pour transformer le match en plan concret."
            }
            onClick={() => trackBetaEvent("feature_usage", "priority_proposals")}
          />
          <BenefitCard
            icon="👻"
            title={language === "en" ? "Go invisible anytime" : "Deviens invisible quand tu veux"}
            text={
              language === "en"
                ? "Enable ghost mode and stay visible only when timing is right."
                : "Active le mode fantome et reste visible seulement quand c'est le bon moment."
            }
            onClick={() => trackBetaEvent("feature_usage", "ghost_mode")}
          />
          <BenefitCard
            icon="📍"
            title={t("premium_feature_3")}
            text={
              language === "en"
                ? "Find shared real-life places to make meeting easier."
                : "Repère des lieux communs crédibles pour passer au réel plus facilement."
            }
            onClick={() => trackBetaEvent("feature_usage", "common_places")}
          />
          <BenefitCard
            icon="🔔"
            title={language === "en" ? "Never miss an opportunity" : "Ne rate plus une opportunite"}
            text={
              language === "en"
                ? "Smart reminders at the right time to follow up naturally."
                : "Rappels intelligents au bon timing pour relancer sans forcer."
            }
            onClick={() => trackBetaEvent("feature_usage", "smart_reminders")}
          />
          <BenefitCard
            icon="🚀"
            title={t("premium_feature_4")}
            text={
              language === "en"
                ? "Smart boost when the right profiles are online."
                : "Boost intelligent quand les bons profils sont réellement connectés."
            }
            onClick={() => trackBetaEvent("feature_usage", "smart_boost")}
          />
        </section>

        <section className="rounded-3xl border border-[#FF3B3B]/30 bg-gradient-to-b from-[#1A1114] to-[#141419] p-5">
          <p className="text-sm font-medium text-[#FF8F8F]">SPLove+</p>
          <p className="mt-1 text-3xl font-semibold text-white">{t("premium_price_month")}</p>
          <ul className="mt-4 space-y-2 text-sm text-white/80">
            <li>{`• ${t("premium_feature_2")}`}</li>
            <li>{`• ${language === "en" ? "Ghost mode" : "Mode fantome"}`}</li>
            <li>{`• ${t("premium_feature_3")}`}</li>
            <li>{`• ${language === "en" ? "Smart reminders" : "Rappels intelligents"}`}</li>
            <li>{`• ${language === "en" ? "Smart boost" : "Smart boost"}`}</li>
          </ul>
          <button
            type="button"
            onClick={handlePrimaryCta}
            disabled={isActive}
            className="mt-4 w-full rounded-2xl bg-[#FF3B3B] px-4 py-3.5 text-[15px] font-semibold text-white transition duration-200 hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isActive ? t("splove_plus_status_active") : t("premium_cta")}
          </button>
          <p className="mt-2 text-center text-xs text-white/55">{t("premium_cancel_anytime")}</p>
          <p className="mt-1 text-center text-xs text-white/45">{t("premium_maybe_paid_after_beta")}</p>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-base font-semibold text-white">{t("premium_try_title")}</h2>
          <div className="grid gap-2">
            <MiniOfferCard
              title={t("one_shot_boost_visibility")}
              price={t("price_eur_199")}
              isActive={isOneShotBoostActive}
              activeDetail={
                isOneShotBoostActive
                  ? oneShotBoostDuration === "60"
                    ? t("boost_duration_60")
                    : t("boost_duration_30")
                  : null
              }
              onClick={() => openOneShot("boost", isOneShotBoostActive)}
            />
            <MiniOfferCard
              title={t("one_shot_ghost")}
              price={t("price_eur_299")}
              isActive={isOneShotGhostActive}
              onClick={() => openOneShot("ghost", isOneShotGhostActive)}
            />
            <MiniOfferCard
              title={t("one_shot_priority")}
              price={t("price_eur_399")}
              isActive={isOneShotPriorityActive}
              onClick={() => openOneShot("priority", isOneShotPriorityActive)}
            />
            <MiniOfferCard
              title={t("one_shot_common_places")}
              price={t("price_eur_299")}
              isActive={isOneShotPlacesActive}
              onClick={() => openOneShot("places", isOneShotPlacesActive)}
            />
            <MiniOfferCard
              title={t("one_shot_smart_reminder")}
              price={t("price_eur_199")}
              isActive={isOneShotReminderActive}
              onClick={() => openOneShot("reminder", isOneShotReminderActive)}
            />
          </div>
        </section>

        <footer className="pb-2 text-center text-sm leading-relaxed text-white/65">
          {t("premium_footer")}
        </footer>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0B0B0F]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={handlePrimaryCta}
            disabled={isActive}
            className="w-full rounded-2xl bg-[#FF3B3B] px-4 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_30px_rgba(255,59,59,0.25)] transition duration-200 hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isActive ? t("splove_plus_status_active") : t("premium_cta")}
          </button>
        </div>
      </div>

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={() => setModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#12121a] p-5 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {modal === "boost" ? (
              <>
                <h2 className="text-lg font-semibold text-white">{t("one_shot_boost_visibility")}</h2>
                <p className="mt-1 text-sm text-[#FF9B9B]">{t("price_eur_199")}</p>
                <p className="mt-4 text-sm font-medium text-white/90">{t("choose_duration")}</p>
                <div className="mt-2 flex gap-2">
                  {(["30", "60"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setBoostDuration(d)}
                      className={`flex-1 rounded-2xl border py-2.5 text-sm font-semibold transition ${
                        boostDuration === d
                          ? "border-[#FF3B3B] bg-[#FF3B3B]/20 text-white"
                          : "border-white/10 bg-white/[0.04] text-white/80"
                      }`}
                    >
                      {d === "30" ? t("boost_duration_30") : t("boost_duration_60")}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {modal === "ghost" ? (
              <>
                <h2 className="text-lg font-semibold text-white">{t("one_shot_ghost")}</h2>
                <p className="mt-1 text-sm text-[#FF9B9B]">{t("price_eur_299")}</p>
                <p className="mt-4 text-sm leading-relaxed text-white/80">{t("activate_ghost_24h")}</p>
              </>
            ) : null}

            {modal === "priority" ? (
              <>
                <h2 className="text-lg font-semibold text-white">{t("one_shot_priority")}</h2>
                <p className="mt-1 text-sm text-[#FF9B9B]">{t("price_eur_399")}</p>
                <p className="mt-4 text-sm leading-relaxed text-white/80">
                  {t("prioritize_next_proposal")}
                </p>
              </>
            ) : null}

            {modal === "places" ? (
              <>
                <h2 className="text-lg font-semibold text-white">{t("one_shot_common_places")}</h2>
                <p className="mt-1 text-sm text-[#FF9B9B]">{t("price_eur_299")}</p>
                <p className="mt-4 text-sm leading-relaxed text-white/80">
                  {t("unlock_common_places_24h")}
                </p>
              </>
            ) : null}

            {modal === "reminder" ? (
              <>
                <h2 className="text-lg font-semibold text-white">{t("one_shot_smart_reminder")}</h2>
                <p className="mt-1 text-sm text-[#FF9B9B]">{t("price_eur_199")}</p>
                <p className="mt-4 text-sm leading-relaxed text-white/80">
                  {t("activate_smart_reminder")}
                </p>
              </>
            ) : null}

            <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs leading-snug text-amber-100/90">
              {t("beta_payment_disabled")}
            </p>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 rounded-2xl border border-white/15 py-3 text-sm font-semibold text-white/90"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={confirmOneShot}
                className="flex-1 rounded-2xl bg-[#FF3B3B] py-3 text-sm font-semibold text-white"
              >
                {modal === "boost"
                  ? t("activate_boost")
                  : modal === "ghost"
                    ? t("activate_ghost_24h")
                    : modal === "priority"
                      ? t("prioritize_next_proposal")
                      : modal === "places"
                        ? t("unlock_common_places_24h")
                        : t("activate_smart_reminder")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#15151D] px-4 py-3 text-center text-sm font-medium text-white shadow-2xl">
            {toastMessage}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ToggleRow({
  label,
  active,
  activeWord,
  activateLabel,
  deactivateLabel,
  onToggle,
}: {
  label: string;
  active: boolean;
  activeWord: string;
  activateLabel: string;
  deactivateLabel: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-0 last:pb-0">
      <span className="text-sm font-medium text-white/95">
        {label}
        {active ? (
          <span className="ml-1.5 text-[11px] font-semibold text-emerald-300/90">· {activeWord}</span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={active ? deactivateLabel : activateLabel}
        onClick={onToggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          active ? "bg-[#FF3B3B]" : "bg-white/20"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
            active ? "left-1 translate-x-5" : "left-1 translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function BenefitCard({
  icon,
  title,
  text,
  onClick,
}: {
  icon: string;
  title: string;
  text: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition duration-150 hover:bg-white/[0.06]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF3B3B]/15 text-lg">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-white/65">{text}</p>
        </div>
      </div>
    </button>
  );
}

function MiniOfferCard({
  title,
  price,
  isActive,
  activeDetail,
  onClick,
}: {
  title: string;
  price: string;
  isActive: boolean;
  activeDetail?: string | null;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-2xl border px-3.5 py-3 text-left transition duration-150 ${
        isActive
          ? "border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/15"
          : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-white">{title}</div>
        {isActive ? (
          <div className="mt-0.5 text-[11px] font-medium text-emerald-300/95">
            ✓ {t("one_shot_activated")}
            {activeDetail ? ` · ${activeDetail}` : null}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <span className={`text-sm font-semibold ${isActive ? "text-emerald-200/90" : "text-[#FF9B9B]"}`}>
          {price}
        </span>
      </div>
    </button>
  );
}
