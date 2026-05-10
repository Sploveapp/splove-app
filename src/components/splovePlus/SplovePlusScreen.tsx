import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useTranslation } from "../../i18n/useTranslation";
import type { Language } from "../../i18n";
import type { TranslationKey } from "../../i18n";
import { IS_BETA_UNDO_FREE } from "../../constants/discoverUndo";
import type { SploveCreditType, SploveTimedFeatureType } from "../../types/sploveCommerce.types";
import { activateFeature } from "../../services/sploveCommerce.service";
import {
  SploveActivatingSpinner,
  SploveBoostIcon,
  SploveChatBubbleIcon,
  SploveDiscreetIcon,
  SploveLightningIcon,
  SploveOrbitPulseIcon,
  SplovePinIcon,
  SploveSparkIcon,
  SploveUndoArrowIcon,
  type SploveIconRenderer,
} from "./SplovePlusIcons";

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
  icon: SploveIconRenderer;
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
  icon: SploveBoostIcon,
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
    icon: SploveChatBubbleIcon,
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
    icon: SploveUndoArrowIcon,
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
    icon: SploveDiscreetIcon,
    title: { fr: "Mode discret", en: "Discreet mode" },
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
    icon: SploveLightningIcon,
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
    icon: SplovePinIcon,
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
    icon: SploveOrbitPulseIcon,
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

/**
 * Bêta : pour les options encore non branchées côté serveur (common_places,
 * smart_reminder), l'activation est purement locale. On stocke un flag par
 * appareil pour que la pastille passe de « Bêta » à « Actif (bêta) » sans
 * toucher au backend.
 */
const BETA_ACTIVE_LS_PREFIX = "splove_plus_beta_active:";

/**
 * Pack SPLove+ — l'« abonnement » bêta est purement front : on retient un
 * flag local pour afficher l'état actif sans toucher à un quelconque flux
 * de paiement (App Store / Stripe / etc.).
 */
const PACK_BETA_LS_KEY = "splove_plus_pack_beta_active";

/**
 * Bêta — l'utilisateur ne doit jamais voir d'erreur générique. Si Supabase
 * répond mal ou que le compte n'a pas encore de crédit, on simule localement
 * une activation propre (mise à jour de l'expiration ou bump du compteur),
 * puis on affiche un succès dédié à la fonctionnalité.
 */
const ACTIVATION_MIN_LATENCY_MS = 700;

function formatActivationDuration(minutes: number, isFr: boolean): string {
  if (minutes <= 0) return isFr ? "la session" : "the session";
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    if (days === 1) return isFr ? "24 h" : "24h";
    return isFr ? `${days} jours` : `${days} days`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    return `${minutes / 60} h`;
  }
  return `${minutes} min`;
}

function readBetaActive(key: SploveUiFeatureKey): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(`${BETA_ACTIVE_LS_PREFIX}${key}`) === "1";
  } catch {
    return false;
  }
}

function writeBetaActive(key: SploveUiFeatureKey): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${BETA_ACTIVE_LS_PREFIX}${key}`, "1");
  } catch {
    /* localStorage indisponible : on ignore, l'UX reste fonctionnelle. */
  }
}

function readPackBetaActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PACK_BETA_LS_KEY) === "1";
  } catch {
    return false;
  }
}

function writePackBetaActive(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PACK_BETA_LS_KEY, "1");
  } catch {
    /* localStorage indisponible : on ignore, l'UX reste fonctionnelle. */
  }
}

export default function SplovePlusScreen() {
  const { language, t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const undoReturnCardRef = useRef<HTMLButtonElement | null>(null);
  const commonPlacesCardRef = useRef<HTMLButtonElement | null>(null);
  const smartReminderCardRef = useRef<HTMLButtonElement | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [creditsQty, setCreditsQty] = useState<Partial<Record<SploveCreditType, number>>>({});
  const [timedExpiry, setTimedExpiry] = useState<Partial<Record<SploveTimedFeatureType, string>>>({});
  const [profileUndo, setProfileUndo] = useState(0);
  const [profileSecondChance, setProfileSecondChance] = useState(0);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmFeatureKey, setConfirmFeatureKey] = useState<SploveUiFeatureKey | null>(null);
  const [activating, setActivating] = useState(false);
  const [betaFeatureKey, setBetaFeatureKey] = useState<SploveUiFeatureKey | null>(null);
  const [betaActiveMap, setBetaActiveMap] = useState<Partial<Record<SploveUiFeatureKey, boolean>>>(
    () => ({
      common_places: readBetaActive("common_places"),
      smart_reminder: readBetaActive("smart_reminder"),
    }),
  );
  const [packModalOpen, setPackModalOpen] = useState(false);
  const [packBetaActive, setPackBetaActive] = useState<boolean>(() => readPackBetaActive());
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
    const target = st?.sploveHighlightFeature;
    if (target !== "undo_swipe_return" && target !== "common_places" && target !== "smart_reminder") {
      return;
    }
    const id = window.setTimeout(() => {
      const ref =
        target === "undo_swipe_return"
          ? undoReturnCardRef
          : target === "common_places"
            ? commonPlacesCardRef
            : smartReminderCardRef;
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      /** Pour les options bêta on ouvre directement la modale d’activation. */
      if (target === "common_places" || target === "smart_reminder") {
        setBetaFeatureKey(target);
      }
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
    setConfirmFeatureKey(feature.key);
  }

  function closeActivateConfirm() {
    setConfirmFeatureKey(null);
  }

  function simulateLocalActivation(feature: SploveFeature) {
    if (!feature.creditType) return;
    const tf = timedFeatureFromCredit(feature.creditType);
    if (tf && feature.durationMinutesUi > 0) {
      const expiresAtIso = new Date(Date.now() + feature.durationMinutesUi * 60_000).toISOString();
      setTimedExpiry((prev) => ({ ...prev, [tf]: expiresAtIso }));
      return;
    }
    if (feature.creditType === "undo_swipe") {
      setProfileUndo((prev) => prev + 1);
    } else if (feature.creditType === "second_chance") {
      setProfileSecondChance((prev) => prev + 1);
    }
  }

  function buildActivationToast(feature: SploveFeature): string {
    const duration = formatActivationDuration(feature.durationMinutesUi, isFr);
    switch (feature.key) {
      case "visibility_boost":
        return t("splove_plus_toast_boost_active", { duration });
      case "ghost_mode":
        return t("splove_plus_toast_ghost_active", { duration });
      case "priority_proposal":
        return t("splove_plus_toast_priority_active", { duration });
      case "second_chance":
        return t("splove_plus_toast_second_chance_ready");
      case "undo_swipe_return":
        return t("splove_plus_toast_undo_ready");
      default:
        return t("splove_plus_activated_toast");
    }
  }

  function closeBetaModal() {
    setBetaFeatureKey(null);
  }

  function handleBetaActivate(key: SploveUiFeatureKey) {
    writeBetaActive(key);
    setBetaActiveMap((prev) => ({ ...prev, [key]: true }));
    setToastMessage(t("splove_plus_beta_activated_toast"));
    closeBetaModal();
  }

  function openPackModal() {
    setPackModalOpen(true);
  }

  function closePackModal() {
    setPackModalOpen(false);
  }

  function handlePackActivate() {
    writePackBetaActive();
    setPackBetaActive(true);
    setToastMessage(t("splove_plus_pack_activated_toast"));
    closePackModal();
  }

  const betaFeatureDef =
    betaFeatureKey != null
      ? secondaryFeatures.find((f) => f.key === betaFeatureKey) ?? null
      : null;

  const confirmFeatureDef =
    confirmFeatureKey != null
      ? confirmFeatureKey === heroFeature.key
        ? heroFeature
        : secondaryFeatures.find((f) => f.key === confirmFeatureKey) ?? null
      : null;

  /**
   * Bêta — la confirmation d'activation est toujours présentée comme un succès :
   * on tente l'activation serveur en best-effort, on retombe silencieusement sur
   * une simulation locale en cas de souci, puis on affiche un toast dédié à la
   * fonctionnalité. Aucun écran d'erreur générique, aucun appel à un faux paiement.
   */
  async function handleConfirmActivation() {
    if (!confirmFeatureDef || !userId || activating) return;
    const feature = confirmFeatureDef;
    const creditType = feature.creditType;
    if (!creditType) return;

    setActivating(true);
    const startedAt = Date.now();

    /** Retour gratuit en bêta : pas d'aller-retour serveur, succès local immédiat. */
    if (IS_BETA_UNDO_FREE && feature.key === "undo_swipe_return") {
      simulateLocalActivation(feature);
      await waitMinLatency(startedAt);
      setToastMessage(buildActivationToast(feature));
      setActivating(false);
      closeActivateConfirm();
      return;
    }

    let serverOk = false;
    try {
      const qty = creditsQty[creditType] ?? 0;
      const source: "credit" | "beta" = qty >= 1 ? "credit" : "beta";
      const res = await activateFeature(userId, creditType, feature.durationMinutesUi, source);
      serverOk = res.ok === true;
    } catch (err) {
      console.warn("[SplovePlusScreen] activateFeature soft-fail (beta fallback)", err);
      serverOk = false;
    }

    if (serverOk) {
      await refreshWallet(userId).catch((err) => {
        console.warn("[SplovePlusScreen] refreshWallet soft-fail", err);
      });
    } else {
      simulateLocalActivation(feature);
    }

    await waitMinLatency(startedAt);
    setToastMessage(buildActivationToast(feature));
    setActivating(false);
    closeActivateConfirm();
  }

  async function waitMinLatency(startedAt: number): Promise<void> {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= ACTIVATION_MIN_LATENCY_MS) return;
    await new Promise((resolve) => setTimeout(resolve, ACTIVATION_MIN_LATENCY_MS - elapsed));
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
    if (!confirmFeatureKey && !betaFeatureKey && !packModalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmFeatureKey) closeActivateConfirm();
      if (betaFeatureKey) closeBetaModal();
      if (packModalOpen) closePackModal();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmFeatureKey, betaFeatureKey, packModalOpen]);

  return (
    <main className="min-h-screen bg-[#08080c] px-4 pb-16 pt-7 text-white">
      <style>{`
        @keyframes sploveOrbitCometPulse {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.25); opacity: 1; }
        }
        @keyframes sploveActivatingSpin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="sploveOrbitCometPulse"],
          [style*="sploveActivatingSpin"] { animation: none !important; }
        }
      `}</style>
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

        <section
          aria-labelledby="splove-plus-pack-title"
          className="rounded-3xl border border-[#ff2433]/55 bg-gradient-to-b from-[#221016] to-[#12121a] p-5 shadow-[0_18px_40px_rgba(255,36,51,0.18)]"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#ffb3bc]">
              <SploveSparkIcon color="currentColor" size={12} />
              {t("splove_plus_pack_label")}
            </p>
            {packBetaActive ? (
              <span className="rounded-full border border-emerald-400/45 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-200">
                {t("splove_plus_pack_active_badge")}
              </span>
            ) : null}
          </div>
          <h2 id="splove-plus-pack-title" className="mt-2 text-xl font-semibold text-white">
            {isFr ? "Pack bêta fondateur" : "Beta founder pack"}
          </h2>
          <p className="mt-2 text-[13px] leading-snug text-white/75">
            {isFr
              ? "Toutes les options SPLove+ réunies dans une seule activation. Pendant la bêta, l’abonnement est simulé."
              : "All SPLove+ perks bundled in a single activation. During beta the subscription is simulated."}
          </p>
          <ul className="mt-4 grid gap-2 text-[13px] text-white/88">
            {[heroFeature, ...secondaryFeatures].map((f) => (
              <li key={f.key} className="flex items-start gap-2">
                <span
                  className="mt-0.5 inline-flex shrink-0 text-[#ffb3bc]"
                  aria-hidden
                >
                  {f.icon({ color: "currentColor", size: 16 })}
                </span>
                <span>
                  <span className="font-semibold">{f.title[language]}</span>
                  <span className="text-white/62"> · </span>
                  <span className="text-white/70">{f.description[language]}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#ffb3bc]">
                {isFr ? "Tarif" : "Price"}
              </p>
              <p className="mt-1 text-2xl font-semibold leading-none text-white">
                {t("splove_plus_pack_price")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openPackModal}
            aria-label={t("splove_plus_pack_cta")}
            className="mt-4 w-full rounded-2xl bg-[#ff2433] py-3.5 text-sm font-semibold tracking-tight text-white shadow-[0_12px_28px_rgba(255,36,51,0.32)] transition-transform duration-150 ease-out active:scale-[0.98]"
          >
            {packBetaActive ? t("splove_plus_pack_active_badge") : t("splove_plus_pack_cta")}
          </button>
          <p className="mt-2 text-center text-[11px] text-white/55">
            {t("splove_plus_pack_pricing_note")}
          </p>
        </section>

        <div className="flex items-center gap-3" role="separator" aria-orientation="horizontal">
          <span aria-hidden className="h-px flex-1 bg-white/10" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
            {t("splove_plus_section_individual")}
          </span>
          <span aria-hidden className="h-px flex-1 bg-white/10" />
        </div>

        <motion.button
          type="button"
          disabled={isTimedWindowBlocking(heroFeature)}
          whileTap={isTimedWindowBlocking(heroFeature) ? undefined : { scale: 0.98 }}
          onClick={() => {
            if (!userId) {
              setToastMessage(t("splove_plus_need_sign_in"));
              return;
            }
            if (isTimedWindowBlocking(heroFeature)) return;
            openActivateConfirm(heroFeature);
          }}
          className={`w-full rounded-2xl border border-white/10 bg-[#111118] p-4 text-left ${
            isTimedWindowBlocking(heroFeature) ? "cursor-not-allowed opacity-65" : ""
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
              <span aria-hidden className="inline-flex text-[#ffb3bc]">
                {heroFeature.icon({ color: "currentColor", size: 18 })}
              </span>
              {heroFeature.title[language]}
            </span>
            {heroFeature.recommended ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#ffb3bc]/45 bg-[#ff2433]/15 px-2 py-0.5 text-[10px] font-semibold text-[#ffd0d3]">
                <span aria-hidden className="inline-flex">
                  <SploveSparkIcon color="currentColor" size={10} />
                </span>
                {isFr ? "Populaire" : "Popular"}
              </span>
            ) : null}
          </div>

          <p className="text-xs text-white/65">{heroFeature.description[language]}</p>
          {walletSubtitle(heroFeature) ? (
            <p className="mt-1.5 text-[10px] text-white/52">{walletSubtitle(heroFeature)}</p>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[#ff9aa1]">
              {formatFeaturePrice(heroFeature.price, language)}
            </span>
            {greenBadgeMinutes(heroFeature) != null ? (
              <span className="max-w-[min(160px,calc(100%-4rem))] rounded-full border border-emerald-400/45 bg-emerald-500/20 px-2 py-0.5 text-center text-[10px] font-semibold leading-snug text-emerald-200">
                {greenBadgeLabel(greenBadgeMinutes(heroFeature))}
              </span>
            ) : (
              <span
                className={`shrink-0 rounded-xl px-3 py-1 text-[11px] font-semibold text-white ${
                  isTimedWindowBlocking(heroFeature) ? "bg-white/15 text-white/55" : "bg-[#ff2433]"
                }`}
              >
                {isFr ? "Activer" : "Activate"}
              </span>
            )}
          </div>
        </motion.button>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {secondaryFeatures.map((feature, index) => {
            const betaActive = feature.comingSoon ? Boolean(betaActiveMap[feature.key]) : false;
            const cardRef =
              feature.key === "undo_swipe_return"
                ? undoReturnCardRef
                : feature.key === "common_places"
                  ? commonPlacesCardRef
                  : feature.key === "smart_reminder"
                    ? smartReminderCardRef
                    : undefined;
            return (
            <motion.button
              key={feature.key}
              ref={cardRef}
              type="button"
              disabled={!feature.comingSoon && isTimedWindowBlocking(feature)}
              whileTap={!feature.comingSoon && isTimedWindowBlocking(feature) ? undefined : { scale: 0.97 }}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * index, duration: 0.35 }}
              onClick={() => {
                if (feature.comingSoon) {
                  setBetaFeatureKey(feature.key);
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
              } ${!feature.comingSoon && isTimedWindowBlocking(feature) ? "cursor-not-allowed opacity-65" : ""}`}
            >
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-white">
                <span aria-hidden className="inline-flex text-[#ffb3bc]">
                  {feature.icon({ color: "currentColor", size: 18 })}
                </span>
                <span>{feature.title[language]}</span>
                {feature.comingSoon ? (
                  betaActive ? (
                    <span className="ml-1 rounded-md border border-emerald-400/45 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-200">
                      {t("splove_plus_beta_active_badge")}
                    </span>
                  ) : (
                    <span className="ml-1 rounded-md border border-[#ffb3bc]/45 bg-[#ff2433]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#ffd0d3]">
                      {t("splove_plus_beta_badge")}
                    </span>
                  )
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
            );
          })}
        </div>
      </motion.section>

      {confirmFeatureKey && confirmFeatureDef && !confirmFeatureDef.comingSoon && confirmFeatureDef.creditType ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-4 pb-8 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              if (!activating) closeActivateConfirm();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="splove-plus-confirm-title"
            className="w-full max-w-md rounded-3xl border border-white/14 bg-[#15151d] p-5 text-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2
              id="splove-plus-confirm-title"
              className="flex items-center gap-2 text-lg font-semibold leading-snug"
            >
              <span aria-hidden className="inline-flex text-[#ffb3bc]">
                {confirmFeatureDef.icon({ color: "currentColor", size: 22 })}
              </span>
              <span>{confirmFeatureDef.title[language]}</span>
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-white/76">
              {confirmFeatureDef.description[language]}
            </p>

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
                <p className="mt-1 text-sm font-medium text-white">
                  {t("splove_plus_confirm_duration_single_use")}
                </p>
              ) : (
                <p className="mt-1 text-sm font-medium text-white">
                  {describeDurationLine(confirmFeatureDef.durationMinutesUi, isFr)}
                </p>
              )}
            </div>

            <div className="mt-3 space-y-1.5 text-[12px] text-white/58">
              {confirmFeatureDef.creditType && (creditsQty[confirmFeatureDef.creditType] ?? 0) >= 1 ? (
                <p>{t("splove_plus_confirm_credit_hint")}</p>
              ) : (
                <p>{t("splove_plus_confirm_beta_note")}</p>
              )}
              {confirmFeatureDef.durationMinutesUi <= 0 ? (
                <p>{t("splove_plus_confirm_single_use_hint")}</p>
              ) : null}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={activating}
                onClick={closeActivateConfirm}
                className="flex-1 rounded-2xl border border-white/18 bg-transparent py-3 text-sm font-semibold text-white/90 hover:bg-white/5 disabled:opacity-50"
              >
                {t("splove_plus_confirm_cancel")}
              </button>
              <button
                type="button"
                disabled={activating}
                aria-busy={activating ? "true" : undefined}
                onClick={() => void handleConfirmActivation()}
                className="flex-1 rounded-2xl bg-[#ff2433] py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,36,51,0.35)] disabled:opacity-90"
              >
                {activating ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <SploveActivatingSpinner />
                    <span>{t("splove_plus_activating")}</span>
                  </span>
                ) : (
                  t("splove_plus_confirm_cta")
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {betaFeatureKey && betaFeatureDef ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-4 pb-8 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeBetaModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="splove-plus-beta-title"
            className="w-full max-w-md rounded-3xl border border-white/14 bg-[#15151d] p-5 text-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2
              id="splove-plus-beta-title"
              className="flex items-center gap-2 text-lg font-semibold leading-snug"
            >
              <span aria-hidden className="inline-flex text-[#ffb3bc]">
                {betaFeatureDef.icon({ color: "currentColor", size: 22 })}
              </span>
              <span>{betaFeatureDef.title[language]}</span>
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-white/76">
              {betaFeatureDef.description[language]}
            </p>
            <p className="mt-3 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-[12px] leading-relaxed text-white/65">
              {t("splove_plus_beta_available_note")}
            </p>
            {betaActiveMap[betaFeatureKey] ? (
              <p className="mt-3 text-[12px] font-medium text-emerald-200">
                {t("splove_plus_beta_already_active")}
              </p>
            ) : null}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={closeBetaModal}
                className="flex-1 rounded-2xl border border-white/18 bg-transparent py-3 text-sm font-semibold text-white/90 hover:bg-white/5"
              >
                {t("splove_plus_beta_later")}
              </button>
              <button
                type="button"
                onClick={() => handleBetaActivate(betaFeatureKey)}
                className="flex-1 rounded-2xl bg-[#ff2433] py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,36,51,0.35)]"
              >
                {t("splove_plus_beta_activate_cta")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {packModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-4 pb-8 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePackModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="splove-plus-pack-modal-title"
            className="w-full max-w-md rounded-3xl border border-[#ff2433]/55 bg-gradient-to-b from-[#1a0f14] to-[#15151d] p-5 text-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#ffb3bc]">
              <SploveSparkIcon color="currentColor" size={12} />
              {t("splove_plus_pack_label")}
            </p>
            <h2
              id="splove-plus-pack-modal-title"
              className="mt-1.5 text-lg font-semibold leading-snug"
            >
              {t("splove_plus_pack_modal_title")}
            </h2>
            <p className="mt-3 rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#ffb3bc]">
                {isFr ? "Tarif" : "Price"}
              </span>
              <span className="mt-1 block text-2xl font-semibold text-white">
                {t("splove_plus_pack_price")}
              </span>
              <span className="mt-1 block text-[11px] text-white/55">
                {t("splove_plus_pack_pricing_note")}
              </span>
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-white/76">
              {t("splove_plus_pack_modal_body")}
            </p>
            {packBetaActive ? (
              <p className="mt-3 text-[12px] font-medium text-emerald-200">
                {t("splove_plus_pack_already_active")}
              </p>
            ) : null}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={closePackModal}
                className="flex-1 rounded-2xl border border-white/18 bg-transparent py-3 text-sm font-semibold text-white/90 hover:bg-white/5"
              >
                {t("splove_plus_beta_later")}
              </button>
              <button
                type="button"
                onClick={handlePackActivate}
                className="flex-1 rounded-2xl bg-[#ff2433] py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,36,51,0.35)]"
              >
                {t("splove_plus_beta_activate_cta")}
              </button>
            </div>
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
