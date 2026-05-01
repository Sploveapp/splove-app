import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useTranslation } from "../../i18n/useTranslation";
import type { Language } from "../../i18n";

export type SploveFeatureKey =
  | "visibility_boost"
  | "second_chance"
  | "undo_swipe_return"
  | "ghost_mode"
  | "priority_proposal"
  | "common_places"
  | "smart_reminder";

type SploveFeaturePrice = string | { fr: string; en: string };

type SploveFeature = {
  key: SploveFeatureKey;
  icon: string;
  title: { fr: string; en: string };
  description: { fr: string; en: string };
  price: SploveFeaturePrice;
  /** Libellé de CTA sous la carte (ex. Retour annul → pass). */
  ctaFootnote?: { fr: string; en: string };
  recommended?: boolean;
  hero?: boolean;
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
    ctaFootnote: { fr: "Activer", en: "Activate" },
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
  },
];

const ALL_FEATURE_KEYS: SploveFeatureKey[] = [
  "visibility_boost",
  "second_chance",
  "undo_swipe_return",
  "ghost_mode",
  "priority_proposal",
  "common_places",
  "smart_reminder",
];

function createInitialFeaturesState(): Record<SploveFeatureKey, boolean> {
  return {
    visibility_boost: false,
    second_chance: false,
    undo_swipe_return: false,
    ghost_mode: false,
    priority_proposal: false,
    common_places: false,
    smart_reminder: false,
  };
}

function isMissingUserFeaturesTableError(
  error: { message?: string; code?: string | number } | null,
): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const msg = (error.message ?? "").toLowerCase();
  return code === "42P01" || msg.includes("user_features") || msg.includes("does not exist");
}

export default function SplovePlusScreen() {
  const { language } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const undoReturnCardRef = useRef<HTMLButtonElement | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeFeatures, setActiveFeatures] = useState<Record<SploveFeatureKey, boolean>>(
    createInitialFeaturesState(),
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isFr = language === "fr";
  const heroFeature = useMemo(() => HERO_FEATURE, []);
  const secondaryFeatures = useMemo(() => SECONDARY_FEATURES, []);

  useEffect(() => {
    let cancelled = false;

    async function loadUserAndFeatures() {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (cancelled) return;
      if (userErr) {
        console.warn("[SplovePlusScreen] auth.getUser failed", {
          code: userErr.code,
          message: userErr.message,
        });
        return;
      }

      const uid = userRes.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;

      const { data, error } = await supabase
        .from("user_features")
        .select("feature_key, active")
        .eq("user_id", uid);

      if (cancelled) return;
      if (error) {
        console.warn("[SplovePlusScreen] user_features load skipped", {
          code: error.code,
          message: error.message,
        });
        return;
      }
      if (!Array.isArray(data)) return;

      const nextState = createInitialFeaturesState();
      for (const row of data as Array<{ feature_key?: unknown; active?: unknown }>) {
        const key = typeof row.feature_key === "string" ? row.feature_key : "";
        if (!ALL_FEATURE_KEYS.includes(key as SploveFeatureKey)) continue;
        if (row.active === true) nextState[key as SploveFeatureKey] = true;
      }

      const { data: entUndo, error: entErr } = await supabase
        .from("user_entitlements")
        .select("feature_key")
        .eq("user_id", uid)
        .eq("feature_key", "undo_swipe_return")
        .maybeSingle();

      if (!cancelled && !entErr && entUndo) {
        nextState.undo_swipe_return = true;
      }

      setActiveFeatures(nextState);
    }

    void loadUserAndFeatures();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const st = location.state as { sploveHighlightFeature?: string } | null | undefined;
    if (st?.sploveHighlightFeature !== "undo_swipe_return") return;

    const id = window.setTimeout(() => {
      undoReturnCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      navigate(location.pathname, { replace: true, state: {} });
    }, 80);

    return () => window.clearTimeout(id);
  }, [location.key, location.pathname, navigate]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  async function activateFeature(featureKey: SploveFeatureKey) {
    if (!userId) {
      setToastMessage(
        isFr ? "Connecte-toi pour activer cette option" : "Sign in to activate this option",
      );
      return;
    }

    if (featureKey === "undo_swipe_return") {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("activate_beta_undo_swipe_return");
      const ok =
        rpcData &&
        typeof rpcData === "object" &&
        (rpcData as { ok?: boolean }).ok === true;
      if (rpcErr || !ok) {
        console.warn("[SplovePlusScreen] activate_beta_undo_swipe_return skipped", rpcErr ?? rpcData);
        setToastMessage(isFr ? "Impossible d’activer Retour tout de suite. Réessaie." : "Couldn’t enable Undo right now.");
        return;
      }
      setActiveFeatures((prev) => ({ ...prev, undo_swipe_return: true }));
      setToastMessage("🔥 Option activée en bêta");
      return;
    }

    const activatedAt = new Date().toISOString();
    const { error } = await supabase.from("user_features").upsert(
      {
        user_id: userId,
        feature_key: featureKey,
        active: true,
        source: "beta",
        activated_at: activatedAt,
      },
      { onConflict: "user_id,feature_key" },
    );

    if (error) {
      console.warn("[SplovePlusScreen] user_features upsert skipped", {
        code: error.code,
        message: error.message,
        featureKey,
      });
      if (isMissingUserFeaturesTableError(error)) {
        setActiveFeatures((prev) => ({ ...prev, [featureKey]: true }));
        setToastMessage("🔥 Option activée en bêta");
      }
      return;
    }

    setActiveFeatures((prev) => ({ ...prev, [featureKey]: true }));
    setToastMessage("🔥 Option activée en bêta");
  }

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
              ? "Pendant la bêta, les avantages sont offerts aux testeurs."
              : "During beta, perks unlock for testers at no charge."}
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
          whileTap={{ scale: 0.97 }}
          animate={{ scale: [1, 1.01, 1] }}
          transition={{ duration: 2, repeat: Infinity, repeatType: "loop", ease: "easeInOut" }}
          onClick={() => void activateFeature(heroFeature.key)}
          className="w-full rounded-3xl border border-[#ff2433]/60 bg-gradient-to-b from-[#231015] to-[#14141a] p-5 text-left shadow-[0_12px_30px_rgba(255,36,51,0.28)]"
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

              <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-2xl font-semibold text-white">{formatFeaturePrice(heroFeature.price, language)}</p>
              {activeFeatures[heroFeature.key] ? (
                <span className="mt-2 inline-flex rounded-full border border-emerald-400/45 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                  {isFr ? "Actif" : "Active"}
                </span>
              ) : null}
            </div>
            <span className="rounded-2xl bg-[#ff2433] px-3 py-2 text-xs font-semibold text-white">
              {isFr ? "Activer maintenant" : "Activate now"}
            </span>
          </div>
        </motion.button>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {secondaryFeatures.map((feature, index) => (
            <motion.button
              key={feature.key}
              ref={feature.key === "undo_swipe_return" ? undoReturnCardRef : undefined}
              type="button"
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * index, duration: 0.35 }}
              onClick={() => void activateFeature(feature.key)}
              className={`rounded-2xl border bg-[#111118] p-4 text-left ${
                feature.key === "undo_swipe_return"
                  ? "border-[#ffb3bc]/55 ring-1 ring-[#ff2433]/20"
                  : "border-white/10"
              }`}
            >
              <p className="text-sm font-semibold text-white">
                {feature.icon} {feature.title[language]}
              </p>
              <p className="mt-2 text-xs text-white/65">{feature.description[language]}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[#ff9aa1]">
                  {formatFeaturePrice(feature.price, language)}
                </span>
                {activeFeatures[feature.key] ? (
                  <span className="rounded-full border border-emerald-400/45 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                    {isFr ? "Actif" : "Active"}
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
