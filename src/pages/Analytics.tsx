import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { SECOND_CHANCE_COPY_TEST } from "../lib/analytics";
import { useAuth } from "../contexts/AuthContext";

/** Autorisation lecture /analytics — aligner aussi `supabase/migrations/086_analytics_events_staff_select.sql`. */
const ADMIN_EMAILS = ["TON_EMAIL_ICI"];

export type AnalyticsVariant = "A" | "B";

const MIN_IMPRESSIONS_PER_VARIANT_FOR_VERDICT = 20;
const VARIANT_LABEL_FR: Record<AnalyticsVariant, string> = {
  A: "Revoir ce profil",
  B: "Seconde chance",
};

export type AnalyticsEventRow = {
  id: string;
  user_id: string | null;
  event_name: string;
  test_name: string | null;
  variant: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type VariantBuckets = {
  impressions: number;
  clicks: number;
  activations: number;
  uses: number;
  matchesAfterUndo: number;
};

function emptyBuckets(): VariantBuckets {
  return {
    impressions: 0,
    clicks: 0,
    activations: 0,
    uses: 0,
    matchesAfterUndo: 0,
  };
}

function aggregateByVariant(rows: AnalyticsEventRow[]): Record<AnalyticsVariant, VariantBuckets> {
  const out: Record<AnalyticsVariant, VariantBuckets> = {
    A: emptyBuckets(),
    B: emptyBuckets(),
  };

  for (const row of rows) {
    const vRaw = typeof row.variant === "string" ? row.variant.trim() : "";
    if (vRaw !== "A" && vRaw !== "B") continue;

    const v = vRaw as AnalyticsVariant;
    const name = typeof row.event_name === "string" ? row.event_name.trim() : "";

    switch (name) {
      case "second_chance_impression":
        out[v].impressions += 1;
        break;
      case "second_chance_click":
        out[v].clicks += 1;
        break;
      case "second_chance_activate":
        out[v].activations += 1;
        break;
      case "second_chance_used":
        out[v].uses += 1;
        break;
      case "match_after_undo":
        out[v].matchesAfterUndo += 1;
        break;
      default:
        break;
    }
  }

  return out;
}

function pct(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return (part / whole) * 100;
}

function formatPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} %`;
}

function isStaffEmail(email: string | undefined | null): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  return ADMIN_EMAILS.some((a) => a.trim().toLowerCase() === e);
}

export default function Analytics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AnalyticsEventRow[]>([]);

  const canView = useMemo(() => isStaffEmail(user?.email ?? null), [user?.email]);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: qErr } = await supabase
        .from("analytics_events")
        .select("id,user_id,event_name,test_name,variant,metadata,created_at")
        .eq("test_name", SECOND_CHANCE_COPY_TEST);

      if (qErr) {
        console.warn("[Analytics]", qErr);
        setError(qErr.message || "Erreur de chargement");
        setRows([]);
        return;
      }

      const list = Array.isArray(data) ? (data as AnalyticsEventRow[]) : [];
      setRows(list.filter((r) => r != null && typeof r === "object"));
    } catch (e) {
      console.warn("[Analytics] exception", e);
      setError("Erreur inattendue");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  const agg = useMemo(() => aggregateByVariant(rows), [rows]);

  const stats = useMemo(() => {
    const build = (v: AnalyticsVariant) => {
      const b = agg[v];
      const clickRate = pct(b.clicks, b.impressions);
      const activationRate = pct(b.activations, b.clicks);
      const realValueRate = pct(b.uses, b.impressions);
      const matchAfterUndoRate = pct(b.matchesAfterUndo, b.uses);
      return {
        buckets: b,
        clickRate,
        activationRate,
        realValueRate,
        matchAfterUndoRate,
      };
    };

    return { A: build("A"), B: build("B") };
  }, [agg]);

  const verdict = useMemo(() => {
    const imA = stats.A.buckets.impressions;
    const imB = stats.B.buckets.impressions;

    if (imA < MIN_IMPRESSIONS_PER_VARIANT_FOR_VERDICT || imB < MIN_IMPRESSIONS_PER_VARIANT_FOR_VERDICT) {
      return {
        kind: "sample" as const,
        title: "Échantillon trop faible. Attends plus de données.",
      };
    }

    const rateA = stats.A.realValueRate;
    const rateB = stats.B.realValueRate;

    if (rateA == null || rateB == null || !Number.isFinite(rateA) || !Number.isFinite(rateB)) {
      return { kind: "insufficient" as const, title: "Pas encore assez de données." };
    }

    const epsilon = 1e-6;
    if (Math.abs(rateA - rateB) < epsilon) {
      return { kind: "insufficient" as const, title: "Pas encore assez de données." };
    }

    if (rateB > rateA) {
      return { kind: "b_wins" as const, title: "Seconde chance gagne pour l'instant." };
    }

    return { kind: "a_wins" as const, title: "Revoir ce profil gagne pour l'instant." };
  }, [stats]);

  if (!canView) {
    return (
      <main className="min-h-screen bg-[#0B0B0F] px-4 py-12 text-white">
        <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-lg font-semibold">Accès réservé</p>
          <p className="mt-3 text-sm text-white/65">Tu n’as pas accès au tableau Analytics.</p>
          <Link
            to="/discover"
            className="mt-6 inline-block rounded-2xl bg-[#FF2D55] px-6 py-3 text-sm font-semibold text-white"
          >
            Retour à l’app
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0B0B0F] px-4 pb-28 pt-8 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="space-y-2 text-center sm:text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#FF2D55]">Interne</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Analytics SPLove</h1>
          <p className="text-sm text-white/65">Suivi conversion — Seconde chance</p>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="mx-auto mt-4 rounded-2xl border border-[#FF2D55]/40 bg-[#FF2D55]/15 px-5 py-2.5 text-sm font-semibold text-[#FF2D55] transition hover:bg-[#FF2D55]/25 disabled:opacity-50 sm:mx-0"
          >
            Rafraîchir les données
          </button>
        </header>

        {error ? (
          <p className="rounded-2xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-center text-sm text-white/55">Chargement…</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <VariantCard
              subtitle="Variante A"
              title={VARIANT_LABEL_FR.A}
              stats={stats.A}
              accentClass="border-[#FF2D55]/35"
              titleAccent="text-[#FF2D55]"
            />
            <VariantCard
              subtitle="Variante B"
              title={VARIANT_LABEL_FR.B}
              stats={stats.B}
              accentClass="border-[#C77DFF]/40"
              titleAccent="text-[#C77DFF]"
            />
          </div>
        )}

        <section
          className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-5 sm:px-8"
          aria-labelledby="verdict-heading"
        >
          <h2 id="verdict-heading" className="text-lg font-semibold text-white">
            Verdict provisoire
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-white/85">{verdict.title}</p>
          <p className="mt-2 text-xs text-white/45">
            Seuil : au moins {MIN_IMPRESSIONS_PER_VARIANT_FOR_VERDICT} impressions par variante pour une comparaison
            sérieuse.
          </p>
        </section>

        <p className="text-center text-[11px] text-white/35">{rows.length} événements (test filtré)</p>

        <div className="text-center">
          <Link to="/discover" className="text-sm font-medium text-white/55 underline underline-offset-4 hover:text-white/85">
            Retour à Discover
          </Link>
        </div>
      </div>
    </main>
  );
}

function VariantCard(props: {
  subtitle: string;
  title: string;
  stats: {
    buckets: VariantBuckets;
    clickRate: number | null;
    activationRate: number | null;
    realValueRate: number | null;
    matchAfterUndoRate: number | null;
  };
  accentClass: string;
  titleAccent: string;
}) {
  const { subtitle, title, stats, accentClass, titleAccent } = props;
  const b = stats.buckets;

  const rows: { label: string; value: string }[] = [
    { label: "Impressions", value: String(b.impressions) },
    { label: "Clics", value: String(b.clicks) },
    { label: "Activations", value: String(b.activations) },
    { label: "Utilisations réelles", value: String(b.uses) },
    { label: "Matchs après retour", value: String(b.matchesAfterUndo) },
    { label: "Taux de clic", value: formatPct(stats.clickRate) },
    { label: "Taux d’activation", value: formatPct(stats.activationRate) },
    { label: "Taux d’usage réel", value: formatPct(stats.realValueRate) },
    { label: "Taux match après retour", value: formatPct(stats.matchAfterUndoRate) },
  ];

  return (
    <article
      className={`flex flex-col rounded-3xl border ${accentClass} bg-[#141419] px-5 py-5 shadow-xl sm:px-6`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{subtitle}</p>
      <h3 className={`mt-1 text-lg font-semibold ${titleAccent}`}>{title}</h3>
      <ul className="mt-5 space-y-3 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex items-baseline justify-between gap-4 border-b border-white/5 pb-2 last:border-0">
            <span className="text-white/65">{r.label}</span>
            <span className="tabular-nums font-semibold text-white">{r.value}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
