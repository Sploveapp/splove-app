import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useTranslation } from "../../i18n/useTranslation";
import type { Language } from "../../i18n";
import type { TranslationKey } from "../../i18n";
import { BETA_MODE } from "../../constants/beta";
import type { SploveCreditType, SploveTimedFeatureType } from "../../types/sploveCommerce.types";
import {
  activateFeature,
  purchaseProduct,
  productIdForCreditType,
} from "../../services/sploveCommerce.service";

export type SploveUiFeatureKey =
  | "visibility_boost"
  | "second_chance"
  | "undo_swipe_return"
  | "ghost_mode"
  | "priority_proposal"
  | "common_places"
  | "smart_reminder";

type SploveFeaturePrice = string | { fr: string; en: string };

type SploveFeature = {
  key: SploveUiFeatureKey;
  icon: string;
  title: { fr: string; en: string };
  description: { fr: string; en: string };
  price: SploveFeaturePrice;
  ctaFootnote?: { fr: string; en: string };
  recommended?: boolean;
  hero?: boolean;
  creditType?: SploveCreditType;
  /** Canonical UI duration shown in modal (minutes). */
  durationMinutesUi: number;
  timedSurface: boolean;
  comingSoon?: boolean;
};

function formatFeaturePrice(price: SploveFeaturePrice, language: Language): string {
  return typeof price === "string" ? price : price[language];
}

const HERO_FEATURE: SploveFeature = {
  key: "visibility_boost",
  icon: "🚀",
  title: { fr: "Boost de visibilité", en: "Visibility boost" },
  description: {
    fr: "Passe devant tout le monde pendant 30 min.",
    en: "Move to the top for 30 minutes.",
  },
  price: "1,99 EUR",
  recommended: true,
  hero: true,
  creditType: "boost_visibility",
  durationMinutesUi: 30,
  timedSurface: true,
};

const SECONDARY_FEATURES: SploveFeature[] = [
  {
    key: "second_chance",
    icon: "💬",
    title: { fr: "Coup franc", en: "Free kick" },
    description: {
      fr: "Message direct sans match",
      en: "Direct message without match",
    },
    price: "1,49 EUR",
    creditType: "second_chance",
    durationMinutesUi: 0,
    timedSurface: false,
  },
  {
    key: "undo_swipe_return",
    icon: "↩️",
    title: { fr: "Retour", en: "Undo" },
    description: {
      fr: "Revois un profil passé trop vite",
      en: "Bring back a profile you passed too quickly",
    },
    price: { fr: "0,99 EUR", en: "€0.99" },
    ctaFootnote: { fr: "Crédits", en: "Credits" },
    creditType: "undo_swipe",
    durationMinutesUi: 0,
    timedSurface: false,
  },
  {
    key: "ghost_mode",
    icon: "👻",
    title: { fr: "Mode fantôme", en: "Ghost mode" },
    description: {
      fr: "Explore sans être vu(e).",
      en: "Browse without being seen.",
    },
    price: "2,99 EUR",
    creditType: "ghost_mode",
    durationMinutesUi: 24 * 60,
    timedSurface: true,
  },
  {
    key: "priority_proposal",
    icon: "⚡",
    title: { fr: "Priorité rencontre", en: "Meeting priority" },
    description: {
      fr: "Passe en haut des propositions.",
      en: "Jump to the top of proposals.",
    },
    price: "3,99 EUR",
    creditType: "priority_meet",
    durationMinutesUi: 24 * 60,
    timedSurface: true,
  },
  {
    key: "common_places",
    icon: "📍",
    title: { fr: "Lieux communs", en: "Common places" },
    description: {
      fr: "Repère où vos trajets peuvent se croiser.",
      en: "Spot where paths can realistically cross.",
    },
    price: "2,99 EUR",
    durationMinutesUi: 0,
    timedSurface: false,
    comingSoon: true,
  },
  {
    key: "smart_reminder",
    icon: "🔔",
    title: { fr: "Rappel intelligent", en: "Smart reminder" },
    description: {
      fr: "Une petite relance au bon moment.",
      en: "A timely nudge when it counts.",
    },
    price: "1,99 EUR",
    durationMinutesUi: 0,
    timedSurface: false,
    comingSoon: true,
  },
];

function effectTranslationKey(key: SploveUiFeatureKey): TranslationKey | null {
  switch (key) {
    case "visibility_boost":
      return "splove_plus_effect_visibility_boost";
    case "second_chance":
      return "splove_plus_effect_second_chance";
    case "undo_swipe_return":
      return "splove_plus_effect_undo_swipe_return";
    case "ghost_mode":
      return "splove_plus_effect_ghost_mode";
    case "priority_proposal":
      return "splove_plus_effect_priority_proposal";
    default:
      return null;
  }
}

function timedFeatureFromCredit(ct: SploveCreditType): SploveTimedFeatureType | null {
  if (ct === "boost_visibility" || ct === "ghost_mode" || ct === "priority_meet") {
    return ct;
  }
  return null;
}

function describeDurationLine(minutes: number, isFr: boolean): string {
  if (minutes <= 0) return "";
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return isFr ? `${days} jour${days > 1 ? "s" : ""}` : `${days} day${days > 1 ? "s" : ""}`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const h = minutes / 60;
    return `${h} h`;
  }
  return isFr ? `${minutes} min` : `${minutes} min`;
}

function remainingMinutesUntil(expiresIso: string, nowMs: number): number | null {
  const end = Date.parse(expiresIso);
  if (!Number.isFinite(end)) return null;
  const leftMs = end - nowMs;
  if (leftMs <= 0) return null;
  return Math.max(1, Math.ceil(leftMs / 60_000));
}

function maxExpiry(rows: Array<{ feature_type: string; expires_at: string }>): Partial<
  Record<SploveTimedFeatureType, string>
> {
  const out: Partial<Record<SploveTimedFeatureType, string>> = {};
  const now = Date.now();
  for (const row of rows) {
    const ft = row.feature_type as SploveTimedFeatureType;
    if (ft !== "boost_visibility" && ft !== "ghost_mode" && ft !== "priority_meet") continue;
    const t = Date.parse(row.expires_at);
    if (!Number.isFinite(t) || t <= now) continue;
    const prev = out[ft];
    if (!prev || t > Date.parse(prev)) out[ft] = row.expires_at;
  }
  return out;
}

function pickActivationSource(walletQty: number): "credit" | "beta" | "purchase" {
  if (walletQty >= 1) return "credit";
  if (BETA_MODE) return "beta";
  return "purchase";
}

export default function SplovePlusScreen() {
  const { language, t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const undoReturnCardRef = useRef<HTMLButtonElement | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [creditsQty, setCreditsQty] = useState<Partial<Record<SploveCreditType, number>>>({});
  const [timedExpiry, setTimedExpiry] = useState<Partial<Record<SploveTimedFeatureType, string>>>({});
  const [profileUndo, setProfileUndo] = useState(0);
  const [profileSecondChance, setProfileSecondChance] = useState(0);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmFeatureKey, setConfirmFeatureKey] = useState<SploveUiFeatureKey | null>(null);
  const [modalPhase, setModalPhase] = useState<"confirm" | "purchase">("confirm");
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [activating, setActivating] = useState(false);
  const [comingSoonFeature, setComingSoonFeature] = useState<SploveUiFeatureKey | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const isFr = language === "fr";
  const heroFeature = useMemo(() => HERO_FEATURE, []);
  const secondaryFeatures = useMemo(() => SECONDARY_FEATURES, []);

  const refreshWallet = useMemo(() => {
    return async (uid: string) => {
      const [credRes, actRes, profRes] = await Promise.all([
        supabase.from("user_credits").select("credit_type, quantity").eq("user_id", uid),
        supabase
          .from("feature_activations")
          .select("feature_type, expires_at")
          .eq("user_id", uid)
          .gte("expires_at", new Date().toISOString()),
        supabase
          .from("profiles")
          .select("undo_swipe_credits, second_chance_credits")
          .eq("id", uid)
          .maybeSingle(),
      ]);

      if (credRes.error) {
        console.warn("[SplovePlusScreen] user_credits", credRes.error);
      } else if (Array.isArray(credRes.data)) {
        const next: Partial<Record<SploveCreditType, number>> = {};
        for (const row of credRes.data as Array<{ credit_type?: string; quantity?: unknown }>) {
          const ct = typeof row.credit_type === "string" ? row.credit_type : "";
          const q = typeof row.quantity === "number" ? row.quantity : Number(row.quantity);
          if (ct === "boost_visibility" || ct === "ghost_mode" || ct === "undo_swipe" || ct === "second_chance" || ct === "priority_meet") {
            next[ct as SploveCreditType] = Number.isFinite(q) ? Math.max(0, Math.floor(q)) : 0;
          }
        }
        setCreditsQty(next);
      }

      if (actRes.error) {
        console.warn("[SplovePlusScreen] feature_activations", actRes.error);
      } else if (Array.isArray(actRes.data)) {
        setTimedExpiry(maxExpiry(actRes.data as Array<{ feature_type: string; expires_at: string }>));
      }

      if (profRes.error) {
        console.warn("[SplovePlusScreen] profiles bridge", profRes.error);
      } else {
        type ProfRow = { undo_swipe_credits?: unknown; second_chance_credits?: unknown };
        const p = profRes.data as ProfRow | null;
        const u =
          typeof p?.undo_swipe_credits === "number"
            ? p.undo_swipe_credits
            : Number.parseInt(String(p?.undo_swipe_credits ?? 0), 10);
        const s =
          typeof p?.second_chance_credits === "number"
            ? p.second_chance_credits
            : Number.parseInt(String(p?.second_chance_credits ?? 0), 10);
        setProfileUndo(Number.isFinite(u) ? Math.max(0, Math.floor(u)) : 0);
        setProfileSecondChance(Number.isFinite(s) ? Math.max(0, Math.floor(s)) : 0);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error) {
        console.warn("[SplovePlusScreen] auth.getUser failed", error);
        return;
      }
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) await refreshWallet(uid);
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [refreshWallet]);

  useEffect(() => {
    const st = location.state as { sploveHighlightFeature?: string } | null | undefined;
    if (st?.sploveHighlightFeature !== "undo_swipe_return") return;
    const id = window.setTimeout(() => {
      undoReturnCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      navigate(location.pathname, { replace: true, state: {} });
    }, 80);
    return () => window.clearTimeout(id);
  }, [location.key, location.pathname, navigate]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2200);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  function timedExpiryIsoFor(feature: SploveFeature): string | undefined {
    if (!feature.creditType) return undefined;
    const tf = timedFeatureFromCredit(feature.creditType);
    if (!tf) return undefined;
    return timedExpiry[tf];
  }

  function isTimedWindowActive(feature: SploveFeature): boolean {
    if (!feature.timedSurface || !feature.creditType) return false;
    const iso = timedExpiryIsoFor(feature);
    if (!iso) return false;
    return remainingMinutesUntil(iso, nowTick) != null;
  }

  /** Green badge ONLY from feature_activations (timed, still running). */
  function greenBadgeMinutes(feature: SploveFeature): number | null {
    if (!feature.timedSurface) return null;
    const iso = timedExpiryIsoFor(feature);
    if (!iso) return null;
    return remainingMinutesUntil(iso, nowTick);
  }

  function greenBadgeLabel(minutesRemaining: number | null): string {
    if (minutesRemaining == null) return "";
    if (minutesRemaining >= 60) {
      const hours = Math.max(1, Math.ceil(minutesRemaining / 60));
      return t("splove_plus_badge_remain_hours", { n: hours });
    }
    return t("splove_plus_badge_remain_minutes", { n: minutesRemaining });
  }

  /** Block re-starting the same timed feature while `feature_activations` shows it still running. */
  function isTimedWindowBlocking(feature: SploveFeature): boolean {
    if (!feature.timedSurface || !feature.creditType) return false;
    return isTimedWindowActive(feature);
  }

  function openActivateConfirm(feature: SploveFeature) {
    setModalPhase("confirm");
    setConfirmFeatureKey(feature.key);
  }

  function closeActivateConfirm() {
    setConfirmFeatureKey(null);
    setModalPhase("confirm");
  }

  const confirmFeatureDef =
    confirmFeatureKey != null
      ? confirmFeatureKey === heroFeature.key
        ? heroFeature
        : secondaryFeatures.find((f) => f.key === confirmFeatureKey) ?? null
      : null;

  async function handleConfirmActivation() {
    if (!confirmFeatureDef?.creditType || !userId || activating) return;
    const qty = creditsQty[confirmFeatureDef.creditType] ?? 0;
    const flow = pickActivationSource(qty);
    if (flow === "purchase") {
      setModalPhase("purchase");
      return;
    }

    const source = flow === "beta" ? "beta" : "credit";
    setActivating(true);
    try {
      const res = await activateFeature(userId, confirmFeatureDef.creditType, confirmFeatureDef.durationMinutesUi, source);
      if (res.need_purchase) {
        setModalPhase("purchase");
        return;
      }
      if (!res.ok) {
        setToastMessage(isFr ? t("splove_plus_error_generic") : t("splove_plus_error_generic"));
        return;
      }
      await refreshWallet(userId);
      setToastMessage(t("splove_plus_activated_toast"));
      closeActivateConfirm();
    } finally {
      setActivating(false);
    }
  }

  async function handleMockPurchase() {
    if (!confirmFeatureDef?.creditType || !userId || purchaseBusy) return;
    setPurchaseBusy(true);
    try {
      const pid = productIdForCreditType(confirmFeatureDef.creditType);
      const r = await purchaseProduct(pid);
      if (!r.ok) {
        setToastMessage(isFr ? t("splove_plus_error_generic") : t("splove_plus_error_generic"));
        return;
      }
      await refreshWallet(userId);
      setModalPhase("confirm");
    } finally {
      setPurchaseBusy(false);
    }
  }

  function walletSubtitle(feature: SploveFeature): string | null {
    if (!feature.creditType) return null;
    const n = creditsQty[feature.creditType] ?? 0;
    if (feature.creditType === "undo_swipe") {
      if (n > 0 || profileUndo > 0) {
        const parts = [n > 0 ? t("splove_plus_wallet_prefix", { n }) : null, profileUndo > 0 ? t("splove_plus_ready_undo", { n: profileUndo }) : null].filter(
          Boolean,
        ) as string[];
        return parts.join(" · ");
      }
      return null;
    }
    if (feature.creditType === "second_chance") {
      if (n > 0 || profileSecondChance > 0) {
        const parts = [
          n > 0 ? t("splove_plus_wallet_prefix", { n }) : null,
          profileSecondChance > 0 ? t("splove_plus_ready_second", { n: profileSecondChance }) : null,
        ].filter(Boolean) as string[];
        return parts.join(" · ");
      }
      return null;
    }
    if (n > 0) return t("splove_plus_wallet_prefix", { n });
    return null;
  }

  useEffect(() => {
    if (!confirmFeatureKey) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeActivateConfirm();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmFeatureKey]);

  return (
    <main className="min-h-screen bg-[#08080c] px-4 pb-16 pt-7 text-white">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="mx-auto w-full max-w-md space-y-5"
      >
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ff6b74]">SPLove+</p>
          <h1 className="text-3xl font-semibold leading-tight text-white">
            {isFr ? "Passe à l’action. Rencontre plus vite." : "Take action. Meet faster."}
          </h1>
          <p className="text-sm text-white/65">
            {isFr
              ? "Tes chances augmentent quand tu agis."
              : "Your chances improve when you take action."}
          </p>
        </header>

        <div className="rounded-3xl border border-white/14 bg-[#12121a] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#ffb3bc]">
            {isFr ? "Pack inclus" : "Bundle highlights"}
          </p>
          <h2 className="mt-1.5 text-lg font-semibold text-white">
            {isFr ? "Pack bêta fondateur" : "Beta founder pack"}
          </h2>
          <p className="mt-2 text-[13px] leading-snug text-white/72">
            {isFr
              ? "Pendant la bêta, tu peux activer sans paiement lorsque tes crédits sont vides ; les lignes sont quand même tracées."
              : "During beta you can activate without credits (ledger still records); with credits they always spend first."}
          </p>
          <ul className="mt-4 grid gap-2 text-[13px] text-white/88">
            {[heroFeature, ...secondaryFeatures].map((f) => (
              <li key={f.key} className="flex gap-2">
                <span className="shrink-0" aria-hidden>
                  {f.icon}
                </span>
                <span>
                  <span className="font-semibold">{f.title[language]}</span>
                  <span className="text-white/62"> · </span>
                  <span className="text-white/70">{f.description[language]}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <motion.button
          type="button"
          disabled={isTimedWindowBlocking(heroFeature)}
          whileTap={isTimedWindowBlocking(heroFeature) ? undefined : { scale: 0.97 }}
          animate={isTimedWindowBlocking(heroFeature) ? undefined : { scale: [1, 1.01, 1] }}
          transition={{ duration: 2, repeat: Infinity, repeatType: "loop", ease: "easeInOut" }}
          onClick={() => {
            if (!userId) {
              setToastMessage(t("splove_plus_need_sign_in"));
              return;
            }
            if (isTimedWindowBlocking(heroFeature)) return;
            openActivateConfirm(heroFeature);
          }}
          className={`w-full rounded-3xl border border-[#ff2433]/60 bg-gradient-to-b from-[#231015] to-[#14141a] p-5 text-left shadow-[0_12px_30px_rgba(255,36,51,0.28)] ${
            isTimedWindowBlocking(heroFeature) ? "cursor-not-allowed opacity-65" : ""
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[#ff9aa1]">
              {heroFeature.icon} {heroFeature.title[language]}
            </span>
            {heroFeature.recommended ? (
              <span className="rounded-full border border-[#ff2433]/60 bg-[#ff2433]/20 px-2 py-0.5 text-[10px] font-semibold text-[#ffd0d3]">
                🔥 {isFr ? "Recommandé" : "Recommended"}
              </span>
            ) : null}
          </div>

          <p className="text-sm text-white/80">{heroFeature.description[language]}</p>
          {walletSubtitle(heroFeature) ? (
            <p className="mt-2 text-[11px] text-white/55">{walletSubtitle(heroFeature)}</p>
          ) : null}

          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-2xl font-semibold text-white">{formatFeaturePrice(heroFeature.price, language)}</p>
              {greenBadgeMinutes(heroFeature) != null ? (
                <span className="mt-2 inline-flex rounded-full border border-emerald-400/45 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold leading-tight text-emerald-200">
                  {greenBadgeLabel(greenBadgeMinutes(heroFeature))}
                </span>
              ) : null}
            </div>
            <span
              className={`rounded-2xl px-3 py-2 text-xs font-semibold text-white ${
                isTimedWindowBlocking(heroFeature) ? "bg-white/20 text-white/50" : "bg-[#ff2433]"
              }`}
            >
              {isFr ? "Activer" : "Activate"}
            </span>
          </div>
        </motion.button>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {secondaryFeatures.map((feature, index) => (
            <motion.button
              key={feature.key}
              ref={feature.key === "undo_swipe_return" ? undoReturnCardRef : undefined}
              type="button"
              disabled={!feature.comingSoon && isTimedWindowBlocking(feature)}
              whileTap={!feature.comingSoon && isTimedWindowBlocking(feature) ? undefined : { scale: 0.97 }}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * index, duration: 0.35 }}
              onClick={() => {
                if (feature.comingSoon) {
                  setComingSoonFeature(feature.key);
                  return;
                }
                if (!userId) {
                  setToastMessage(t("splove_plus_need_sign_in"));
                  return;
                }
                if (isTimedWindowBlocking(feature)) return;
                openActivateConfirm(feature);
              }}
              className={`rounded-2xl border bg-[#111118] p-4 text-left ${
                feature.key === "undo_swipe_return"
                  ? "border-[#ffb3bc]/55 ring-1 ring-[#ff2433]/20"
                  : "border-white/10"
              } ${feature.comingSoon ? "opacity-90" : ""} ${!feature.comingSoon && isTimedWindowBlocking(feature) ? "cursor-not-allowed opacity-65" : ""}`}
            >
              <p className="text-sm font-semibold text-white">
                {feature.icon} {feature.title[language]}
                {feature.comingSoon ? (
                  <span className="ml-2 rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/50">
                    Soon
                  </span>
                ) : null}
              </p>
              <p className="mt-2 text-xs text-white/65">{feature.description[language]}</p>
              {walletSubtitle(feature) ? (
                <p className="mt-1.5 text-[10px] text-white/52">{walletSubtitle(feature)}</p>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[#ff9aa1]">
                  {formatFeaturePrice(feature.price, language)}
                </span>
                {greenBadgeMinutes(feature) != null ? (
                  <span className="max-w-[min(140px,calc(100%-4rem))] rounded-full border border-emerald-400/45 bg-emerald-500/20 px-2 py-0.5 text-center text-[10px] font-semibold leading-snug text-emerald-200">
                    {greenBadgeLabel(greenBadgeMinutes(feature))}
                  </span>
                ) : feature.ctaFootnote ? (
                  <span className="shrink-0 rounded-xl bg-[#ff2433] px-3 py-1 text-[11px] font-bold text-white">
                    {feature.ctaFootnote[language]}
                  </span>
                ) : null}
              </div>
            </motion.button>
          ))}
        </div>
      </motion.section>

      {confirmFeatureKey && confirmFeatureDef && !confirmFeatureDef.comingSoon && confirmFeatureDef.creditType ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-4 pb-8 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeActivateConfirm();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="splove-plus-confirm-title"
            className="w-full max-w-md rounded-3xl border border-white/14 bg-[#15151d] p-5 text-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {modalPhase === "purchase" ? (
              <>
                <h2 id="splove-plus-confirm-title" className="text-lg font-semibold leading-snug">
                  {t("splove_plus_purchase_title")}
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-white/72">{t("splove_plus_purchase_body")}</p>
                {import.meta.env.DEV ? (
                  <p className="mt-2 font-mono text-[11px] text-white/45">
                    {t("splove_plus_purchase_product_id_label", {
                      id: productIdForCreditType(confirmFeatureDef.creditType),
                    })}
                  </p>
                ) : null}
                <div className="mt-5 flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={purchaseBusy}
                    onClick={() => void handleMockPurchase()}
                    className="w-full rounded-2xl bg-[#ff2433] py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,36,51,0.35)] disabled:opacity-50"
                  >
                    {purchaseBusy ? "…" : t("splove_plus_purchase_simulate")}
                  </button>
                  <button
                    type="button"
                    disabled={purchaseBusy}
                    onClick={() => setModalPhase("confirm")}
                    className="w-full rounded-2xl border border-white/18 py-3 text-sm font-semibold text-white/90 hover:bg-white/5"
                  >
                    {t("splove_plus_purchase_back")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="splove-plus-confirm-title" className="text-lg font-semibold leading-snug">
                  {confirmFeatureDef.title[language]}
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-white/76">{confirmFeatureDef.description[language]}</p>

                {(() => {
                  const ek = effectTranslationKey(confirmFeatureDef.key);
                  return ek ? (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#ffb3bc]">
                        {t("splove_plus_modal_effect_label")}
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-white/78">{t(ek)}</p>
                    </div>
                  ) : null;
                })()}

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#ffb3bc]">
                    {t("splove_plus_confirm_duration_prefix")}
                  </p>
                  {confirmFeatureDef.durationMinutesUi <= 0 ? (
                    <p className="mt-1 text-sm font-medium text-white">{t("splove_plus_confirm_duration_single_use")}</p>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-white">
                      {describeDurationLine(confirmFeatureDef.durationMinutesUi, isFr)}
                    </p>
                  )}
                </div>

                <div className="mt-3 space-y-1.5 text-[12px] text-white/58">
                  {confirmFeatureDef.creditType && (creditsQty[confirmFeatureDef.creditType] ?? 0) >= 1 ? (
                    <p>{t("splove_plus_confirm_credit_hint")}</p>
                  ) : BETA_MODE ? (
                    <p>{t("splove_plus_confirm_beta_note")}</p>
                  ) : (
                    <p>{t("splove_plus_purchase_body")}</p>
                  )}
                  {confirmFeatureDef.durationMinutesUi <= 0 ? <p>{t("splove_plus_confirm_single_use_hint")}</p> : null}
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    disabled={activating || purchaseBusy}
                    onClick={closeActivateConfirm}
                    className="flex-1 rounded-2xl border border-white/18 bg-transparent py-3 text-sm font-semibold text-white/90 hover:bg-white/5"
                  >
                    {t("splove_plus_confirm_cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={activating || purchaseBusy}
                    onClick={() => void handleConfirmActivation()}
                    className="flex-1 rounded-2xl bg-[#ff2433] py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,36,51,0.35)] disabled:opacity-50"
                  >
                    {activating ? "…" : t("splove_plus_confirm_cta")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {comingSoonFeature ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-4 pb-8 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setComingSoonFeature(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-3xl border border-white/14 bg-[#15151d] p-5 text-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">{t("splove_plus_coming_title")}</h2>
            <p className="mt-2 text-[13px] text-white/72">{t("splove_plus_coming_detail")}</p>
            <button
              type="button"
              onClick={() => setComingSoonFeature(null)}
              className="mt-5 w-full rounded-2xl bg-[#ff2433] py-3 text-sm font-semibold text-white"
            >
              {t("splove_plus_got_it")}
            </button>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#15151d] px-4 py-3 text-center text-sm font-medium text-white">
            {toastMessage}
          </div>
        </div>
      ) : null}
    </main>
  );
}
