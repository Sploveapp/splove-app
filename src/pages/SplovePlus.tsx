import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { usePremium } from "../hooks/usePremium";
import { supabase } from "../lib/supabase";
import { SplovePlusPaywall } from "../components/SplovePlusPaywall";
import { SplovePlusBenefits } from "../components/SplovePlusBenefits";
import { BoostPresenceModal } from "../components/BoostPresenceModal";
import { BoostActiveStatus } from "../components/BoostActiveStatus";
import {
  PremiumSuggestionsSection,
  type PremiumSuggestion,
} from "../components/PremiumSuggestionsSection";
import {
  filterCandidatesByPreferenceCompatibility,
  logPreferenceCompatibilityPipeline,
} from "../lib/matchingPreferences";
import { BETA_MODE } from "../constants/beta";

type ProfileRow = {
  id: string;
  first_name: string | null;
  birth_date: string | null;
  main_photo_url: string | null;
  sport_feeling: string | null;
  gender: string | null;
  looking_for: string | null;
};

function getAgeFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 18 && age <= 120 ? age : null;
}

function goToDiscover(navigate: ReturnType<typeof useNavigate>) {
  navigate("/discover", { replace: false });
}

export default function SplovePlus() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasPlus } = usePremium(user?.id ?? null);
  const [boostModalOpen, setBoostModalOpen] = useState(false);
  const [boostEndsAt, setBoostEndsAt] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PremiumSuggestion[]>([]);

  /** En bêta, accès équivalent SPLove+ sans abonnement (`usePremium` + `hasPremiumAccess`). */
  const sploveUnlocked = BETA_MODE || hasPlus;

  useEffect(() => {
    async function loadData() {
      if (!user?.id) return;
      const nowIso = new Date().toISOString();

      const [meRes, boostRes, suggestionsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("gender, looking_for")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("profile_boosts")
          .select("ends_at")
          .eq("profile_id", user.id)
          .gt("ends_at", nowIso)
          .order("ends_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id, first_name, birth_date, main_photo_url, sport_feeling, gender, looking_for")
          .eq("profile_completed", true)
          .not("main_photo_url", "is", null)
          .neq("main_photo_url", "")
          .neq("id", user.id)
          .order("created_at", { ascending: false })
          .limit(40),
      ]);

      setBoostEndsAt(((boostRes.data as { ends_at?: string | null } | null)?.ends_at ?? null));

      const me = meRes.data as { gender?: string | null; looking_for?: string | null } | null;
      const meForCompat = {
        gender: me?.gender ?? null,
        looking_for: me?.looking_for ?? null,
      };

      let raw = (suggestionsRes.data as ProfileRow[] | null) ?? [];
      const beforeCompat = raw.length;
      raw = filterCandidatesByPreferenceCompatibility(meForCompat, raw);
      logPreferenceCompatibilityPipeline(
        "SplovePlus",
        meForCompat,
        beforeCompat,
        raw.length,
        raw.map((r) => r.first_name?.trim() ?? "").filter(Boolean),
      );
      raw = raw.slice(0, 3);
      console.log("[SplovePlus] rendered names (after compat + slice)", {
        count: raw.length,
        names: raw.map((r) => r.first_name?.trim() ?? "").filter(Boolean),
      });

      const rows = raw.map((row, index) => ({
        id: row.id,
        photoUrl: row.main_photo_url,
        firstName: row.first_name?.trim() || "Profil",
        age: getAgeFromBirthDate(row.birth_date),
        commonSport: index === 0 ? "Running" : index === 1 ? "Padel" : "Fitness",
        projectionCopy:
          row.sport_feeling?.trim() ||
          (index === 0
            ? "Disponible pour une sortie running cette semaine"
            : index === 1
              ? "Meme energie pour une session skate"
              : "Un bon profil pour proposer une activite rapidement"),
      }));
      setSuggestions(rows);
    }
    void loadData();
  }, [user?.id]);

  const remainingMinutes = useMemo(() => {
    if (!boostEndsAt) return 0;
    const ms = new Date(boostEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 60000));
  }, [boostEndsAt]);

  async function activateBoost(duration: 30 | 60) {
    if (!user?.id) return;
    const now = new Date();
    const endsAt = new Date(now.getTime() + duration * 60 * 1000).toISOString();
    const { error } = await supabase.from("profile_boosts").insert({
      profile_id: user.id,
      starts_at: now.toISOString(),
      ends_at: endsAt,
    });
    if (error) return;
    setBoostEndsAt(endsAt);
    setBoostModalOpen(false);
  }

  const handleUpgrade = () => {
    if (BETA_MODE) {
      goToDiscover(navigate);
      return;
    }
    navigate("/checkout");
  };

  return (
    <div className="min-h-0 bg-app-bg">
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-8 pt-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToDiscover(navigate)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-app-border bg-app-card text-lg text-app-text transition hover:bg-app-border"
              aria-label="Retour à Découvrir"
            >
              ←
            </button>
            <Link
              to="/discover"
              className="text-sm font-semibold text-app-accent underline-offset-2 hover:underline"
            >
              Retour à Découvrir
            </Link>
          </div>
          {BETA_MODE ? (
            <p className="text-center text-[11px] font-medium uppercase tracking-wide text-app-muted">
              Splove+ offert pendant la bêta
            </p>
          ) : null}
        </div>

        {sploveUnlocked ? (
          <>
            <SplovePlusBenefits
              onBoost={() => setBoostModalOpen(true)}
              onSeeSuggestions={() => {
                const el = document.getElementById("splove-plus-suggestions");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
            {remainingMinutes > 0 ? (
              <BoostActiveStatus
                remainingMinutes={remainingMinutes}
                onViewImpact={() => navigate("/discover")}
                onExtend={() => setBoostModalOpen(true)}
              />
            ) : null}
          </>
        ) : (
          <SplovePlusPaywall
            onActivate={handleUpgrade}
            onContinueFree={() => goToDiscover(navigate)}
          />
        )}

        <div id="splove-plus-suggestions">
          <PremiumSuggestionsSection
            items={suggestions}
            ctaLabel="Voir le profil"
            onCardCta={() => navigate("/discover")}
          />
        </div>
      </main>

      <BoostPresenceModal
        open={boostModalOpen}
        onClose={() => setBoostModalOpen(false)}
        onActivate={(duration) => void activateBoost(duration)}
      />
    </div>
  );
}
