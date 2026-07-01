import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ActivityPayload } from "../../lib/chatActivity";
import { formatActivityProposalNote, sportEmojiHint } from "../../lib/chatActivity";
import { toSupabaseScheduledAtIso } from "../../lib/activitySchedule";
import { BRAND_BG, TEXT_ON_BRAND } from "../../constants/theme";
import { SAFETY_CONTENT_REFUSAL } from "../../constants/copy";
import { messageContainsDisallowedContent } from "../../lib/contentModeration";
import { useTranslation } from "../../i18n/useTranslation";
import {
  buildAssistantSuggestedMessage,
  buildCoachOutingSuggestions,
  buildCoachPreviewQuote,
  computeCoachCompatibility,
  DEFAULT_OUTING_TYPE,
  formatCoachPreviewDateLabel,
  formatCoachPreviewTimeLabel,
  resolveAssistantSportContext,
  scoreSlotForOutingType,
  suggestMeetupPlaces,
  type OutingType,
} from "../../lib/splovePlusAssistant";
import { CoachSplovePlusPreview } from "./CoachSplovePlusPreview";
import type { TranslationKey } from "../../i18n";

const OUTING_CONTEXT_KEYS: Record<OutingType, TranslationKey> = {
  relaxation: "coach_outing_context_relaxation",
  leisure: "coach_outing_context_leisure",
  intense: "coach_outing_context_intense",
  discovery: "coach_outing_context_discovery",
};

type CoachWizardStep = "preview" | "form";

export type CreateMeetupSubmitMeta = { priority?: boolean };

export type CreateMeetupModalProps = {
  open: boolean;
  onClose: () => void;
  /** SPLove+ : préremplissage Coach (sport, message, suggestions). */
  coachEnabled: boolean;
  onSubmit: (payload: ActivityPayload, meta?: CreateMeetupSubmitMeta) => Promise<void>;
  sharedSports: string[];
  userSports: string[];
  viewerCity?: string | null;
  partnerCity?: string | null;
  initialSport?: string;
  initialPlace?: string;
  initialScheduledAt?: string;
  suggestedSlots?: string[];
  matchDistanceKm?: number | null;
  viewerPracticeType?: string | null;
  partnerPracticeType?: string | null;
  titleOverride?: string;
  descriptionOverride?: string;
};

const QUICK_NOTE_CHIP_KEYS = [
  "activity_modal_chip_1",
  "activity_modal_chip_2",
  "activity_modal_chip_3",
  "activity_modal_chip_4",
] as const;

function defaultScheduleParts(): { date: string; time: string } {
  const fallback = new Date(Date.now() + 24 * 60 * 60 * 1000);
  fallback.setHours(18, 0, 0, 0);
  const local = new Date(fallback.getTime() - fallback.getTimezoneOffset() * 60_000);
  const iso = local.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

function splitScheduledAt(iso?: string): { date: string; time: string } {
  if (!iso) return defaultScheduleParts();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return defaultScheduleParts();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  const s = local.toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}

function combineDateAndTime(date: string, time: string): string {
  if (!date.trim()) return "";
  const t = time.trim() || "18:00";
  return `${date}T${t}`;
}

/**
 * Formulaire unique « Créer ma sortie ».
 * Même interface pour tous ; le Coach SPLove+ préremplit et suggère lorsque `coachEnabled`.
 */
export function CreateMeetupModal({
  open,
  onClose,
  coachEnabled,
  onSubmit,
  sharedSports,
  userSports,
  viewerCity,
  partnerCity,
  initialSport,
  initialPlace,
  initialScheduledAt,
  suggestedSlots = [],
  matchDistanceKm = null,
  viewerPracticeType = null,
  partnerPracticeType = null,
  titleOverride,
  descriptionOverride,
}: CreateMeetupModalProps) {
  const { t, language } = useTranslation();
  const dateLocale = language === "en" ? "en-GB" : "fr-FR";

  const sportContext = useMemo(
    () => resolveAssistantSportContext(sharedSports, userSports),
    [sharedSports, userSports],
  );

  const placeSuggestions = useMemo(
    () =>
      coachEnabled
        ? suggestMeetupPlaces({
            viewerCity,
            partnerCity,
            initialPlace,
          })
        : [],
    [coachEnabled, viewerCity, partnerCity, initialPlace],
  );

  const [sport, setSport] = useState("");
  const [sportOther, setSportOther] = useState("");
  const [dateLocal, setDateLocal] = useState("");
  const [timeLocal, setTimeLocal] = useState("");
  const [place, setPlace] = useState("");
  const [message, setMessage] = useState("");
  const [noteText, setNoteText] = useState("");
  const [showCustomNote, setShowCustomNote] = useState(false);
  const [messageTouched, setMessageTouched] = useState(false);
  const [priorityEnabled, setPriorityEnabled] = useState(false);
  const [coachStep, setCoachStep] = useState<CoachWizardStep>("form");
  const [outingType, setOutingType] = useState<OutingType>(DEFAULT_OUTING_TYPE);
  const [rankedSports, setRankedSports] = useState<string[]>([]);
  const [coachContextLine, setCoachContextLine] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useCoachSports = coachEnabled && sportContext.selectableSports.length > 0;
  const classicSharedMode = !coachEnabled && sharedSports.length > 0;
  const classicFreeSportMode = !coachEnabled && sharedSports.length === 0;

  const coachSportOptions =
    rankedSports.length > 0 ? rankedSports : sportContext.selectableSports;

  const displaySuggestedSlots = useMemo(() => {
    if (!coachEnabled || !outingType || suggestedSlots.length === 0) return suggestedSlots;
    return [...suggestedSlots].sort(
      (a, b) => scoreSlotForOutingType(b, outingType) - scoreSlotForOutingType(a, outingType),
    );
  }, [coachEnabled, outingType, suggestedSlots]);

  const contextKey = [
    open,
    coachEnabled,
    sportContext.case,
    sportContext.selectableSports.join("\u0001"),
    sharedSports.join("\u0001"),
    initialSport ?? "",
    initialPlace ?? "",
    initialScheduledAt ?? "",
  ].join("|");

  function applyCoachOutingPrefill(type: OutingType) {
    const suggestions = buildCoachOutingSuggestions({
      outingType: type,
      selectableSports: sportContext.selectableSports,
      sharedSports,
      userSports,
      sportCase: sportContext.case,
      suggestedSlots,
    });

    setRankedSports(suggestions.rankedSports);
    setSport(suggestions.recommendedSport);
    setPlace(placeSuggestions[0] ?? (initialPlace ?? "").trim());

    const hasCommon = sportContext.case !== "no_common";
    setMessage(
      buildAssistantSuggestedMessage({
        sport: suggestions.recommendedSport,
        hasCommonSport: hasCommon,
        language,
        outingType: type,
      }),
    );
    setMessageTouched(false);

    if (suggestions.bestSlotIso) {
      const parts = splitScheduledAt(suggestions.bestSlotIso);
      setDateLocal(parts.date);
      setTimeLocal(parts.time);
    } else {
      setDateLocal(suggestions.defaultSchedule.date);
      setTimeLocal(suggestions.defaultSchedule.time);
    }

    if (suggestions.recommendedSport) {
      setCoachContextLine(t(OUTING_CONTEXT_KEYS[type], { sport: suggestions.recommendedSport }));
    } else {
      setCoachContextLine(null);
    }
  }

  function openCoachPreview() {
    const type = DEFAULT_OUTING_TYPE;
    setOutingType(type);
    applyCoachOutingPrefill(type);
    setCoachStep("preview");
  }

  function openCoachForm() {
    if (!outingType) setOutingType(DEFAULT_OUTING_TYPE);
    setCoachStep("form");
  }

  useEffect(() => {
    if (!open) return;

    const prefSport = (initialSport ?? "").trim();
    const { date, time } = splitScheduledAt(initialScheduledAt);
    setPriorityEnabled(false);
    setError(null);
    setSending(false);
    setMessageTouched(false);
    setNoteText("");
    setShowCustomNote(false);

    if (coachEnabled) {
      setRankedSports([]);
      setCoachContextLine(null);
      setSport("");
      setSportOther("");
      setPlace((initialPlace ?? "").trim());
      setMessage("");
      setDateLocal(date);
      setTimeLocal(time);
      void prefSport;
      openCoachPreview();
    } else {
      setCoachStep("form");
      const isSharedSport = prefSport.length > 0 && sharedSports.includes(prefSport);
      const initial = isSharedSport ? prefSport : sharedSports.length > 0 ? sharedSports[0]! : "";
      setSport(initial);
      setSportOther(isSharedSport ? "" : prefSport);
      setPlace((initialPlace ?? "").trim());
      setMessage("");
      setDateLocal(date);
      setTimeLocal(time);
    }
  }, [
    contextKey,
    coachEnabled,
    open,
    initialSport,
    initialPlace,
    initialScheduledAt,
    sharedSports,
  ]);

  useEffect(() => {
    if (!open || !coachEnabled || coachStep !== "form" || messageTouched || !outingType) return;
    const hasCommon = sportContext.case !== "no_common";
    setMessage(
      buildAssistantSuggestedMessage({
        sport: sport.trim() || sportContext.initialSport,
        hasCommonSport: hasCommon,
        language,
        outingType,
      }),
    );
  }, [
    sport,
    sportContext.case,
    sportContext.initialSport,
    open,
    messageTouched,
    coachEnabled,
    coachStep,
    outingType,
    language,
  ]);

  const resolvedSport = useMemo(() => {
    if (coachEnabled || classicSharedMode) {
      if (classicSharedMode && sport === "__other__") return sportOther.trim();
      return sport.trim();
    }
    return sportOther.trim();
  }, [coachEnabled, classicSharedMode, sport, sportOther]);

  const scheduledAtLocal = combineDateAndTime(dateLocal, timeLocal);
  const canSubmit = Boolean(resolvedSport && dateLocal.trim() && timeLocal.trim());
  const showCoachBanner = false;
  const showPreviewStep = coachEnabled && coachStep === "preview";

  const coachCompatibility = useMemo(
    () =>
      computeCoachCompatibility({
        sharedSportsCount: sharedSports.length,
        hasSuggestedSlot: suggestedSlots.length > 0,
        viewerPracticeType,
        partnerPracticeType,
        distanceKm: matchDistanceKm,
      }),
    [sharedSports.length, suggestedSlots.length, viewerPracticeType, partnerPracticeType, matchDistanceKm],
  );

  const coachPreviewQuote = useMemo(() => {
    if (!coachEnabled) return "";
    return buildCoachPreviewQuote({
      sport: resolvedSport,
      hasCommonSport: sportContext.case !== "no_common",
      language,
      outingType,
    });
  }, [coachEnabled, outingType, resolvedSport, sportContext.case, language]);

  const coachDateLabel = useMemo(
    () => formatCoachPreviewDateLabel(dateLocal, language),
    [dateLocal, language],
  );

  const coachTimeLabel = useMemo(
    () => formatCoachPreviewTimeLabel(timeLocal, language),
    [timeLocal, language],
  );

  const modalTitle =
    titleOverride ??
    (showPreviewStep
      ? `✨ ${t("coach_preview_title")}`
      : coachEnabled && coachStep === "form"
        ? t("coach_form_edit_title")
        : t("chat_create_meetup_cta"));

  const modalSubtitle =
    descriptionOverride ??
    (showPreviewStep
      ? t("coach_screen_subtitle")
      : coachEnabled && coachStep === "form"
        ? t("coach_form_edit_subtitle")
        : t("activity_modal_description_default"));

  async function submitMeetup() {
    if (!resolvedSport) {
      setError(t("activity_modal_err_sport"));
      return;
    }
    const scheduledAtDate = new Date(scheduledAtLocal);
    if (Number.isNaN(scheduledAtDate.getTime())) {
      setError(t("activity_modal_err_datetime"));
      return;
    }

    const userLine = coachEnabled ? message.trim() : noteText.trim();
    const fullMessage = formatActivityProposalNote({
      sport: resolvedSport,
      when: "other",
      place: place.trim(),
      userLine,
    });

    const scheduledAtIso =
      toSupabaseScheduledAtIso(scheduledAtDate.toISOString()) ?? scheduledAtDate.toISOString();

    const pieces = [place.trim(), userLine, sportOther.trim(), resolvedSport];
    for (const p of pieces) {
      if (p && messageContainsDisallowedContent(p)) {
        setError(t("safety_content_refusal"));
        return;
      }
    }
    if (messageContainsDisallowedContent(fullMessage)) {
      setError(t("safety_content_refusal"));
      return;
    }

    setError(null);
    setSending(true);
    try {
      await onSubmit(
        {
          sport: resolvedSport,
          when: "other",
          place: place.trim(),
          message: fullMessage,
          scheduledAt: scheduledAtIso,
        },
        coachEnabled && priorityEnabled ? { priority: true } : undefined,
      );
      onClose();
    } catch (err) {
      console.error("[CreateMeetupModal] submit failed:", err);
      const m = err instanceof Error ? err.message : "";
      const low = m.toLowerCase();
      if (!m) {
        setError(t("activity_modal_err_send"));
      } else if (m === SAFETY_CONTENT_REFUSAL || m === "safety_content_refusal") {
        setError(t("safety_content_refusal"));
      } else if (
        low.includes("23505") ||
        low.includes("uniq_pending_per_conversation") ||
        low.includes("duplicate key") ||
        low.includes("cannot coerce") ||
        low.includes("pgrst116")
      ) {
        setError(t("chat_double_slot_waiting"));
      } else if (m.startsWith("chat_") || m.startsWith("proposal_") || m.startsWith("safety_")) {
        setError(t(m));
      } else {
        setError(m);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (showPreviewStep) return;
    await submitMeetup();
  }

  function renderSportField() {
    if (useCoachSports) {
      if (sportContext.selectableSports.length === 0) {
        return (
          <p className="rounded-2xl border border-dashed border-app-border bg-app-bg/60 px-4 py-3 text-[13px] text-app-muted">
            {t("assistant_splove_plus_no_sports_available")}
          </p>
        );
      }

      if (sportContext.case === "single_common") {
        return (
          <div className="flex items-center gap-3 rounded-2xl border border-app-border/80 bg-app-bg/50 px-4 py-3.5">
            <span className="text-2xl" aria-hidden>
              {sportEmojiHint(resolvedSport)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">
                {t("activity_modal_label_sport")}
              </p>
              <select
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                className="mt-0.5 w-full bg-transparent text-[16px] font-semibold text-app-text outline-none"
              >
                {coachSportOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      }

      return (
        <fieldset className="space-y-2">
          <legend className="sr-only">{t("activity_modal_label_sport")}</legend>
          {coachSportOptions.map((s) => {
            const selected = sport === s;
            return (
              <label
                key={s}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 transition ${
                  selected
                    ? "border-[#FF1E2D]/35 bg-[#FF1E2D]/[0.06] ring-1 ring-[#FF1E2D]/20"
                    : "border-app-border/80 bg-app-bg/40 hover:bg-app-bg/70"
                }`}
              >
                <input
                  type="radio"
                  name="meetup-sport"
                  value={s}
                  checked={selected}
                  onChange={() => setSport(s)}
                  className="h-4 w-4 accent-[#FF1E2D]"
                />
                <span className="text-xl" aria-hidden>
                  {sportEmojiHint(s)}
                </span>
                <span className="text-[15px] font-medium text-app-text">{s}</span>
              </label>
            );
          })}
        </fieldset>
      );
    }

    if (classicSharedMode) {
      return (
        <>
          <select
            value={sharedSports.includes(sport) ? sport : "__other__"}
            onChange={(e) => setSport(e.target.value)}
            className="w-full rounded-2xl border border-app-border bg-app-card px-3 py-3 text-[15px] text-app-text outline-none focus:ring-2 focus:ring-[#FF1E2D]/25"
          >
            {sharedSports.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="__other__">{t("activity_modal_option_other")}</option>
          </select>
          {sport === "__other__" ? (
            <input
              value={sportOther}
              onChange={(e) => setSportOther(e.target.value)}
              placeholder={t("activity_modal_placeholder_sport_specify")}
              className="mt-2 w-full rounded-2xl border border-app-border bg-white px-3 py-3 text-[15px] text-black outline-none placeholder:text-gray-400"
            />
          ) : null}
        </>
      );
    }

    if (classicFreeSportMode) {
      return (
        <input
          value={sportOther}
          onChange={(e) => setSportOther(e.target.value)}
          placeholder={t("activity_modal_placeholder_sport_free")}
          className="w-full rounded-2xl border border-app-border bg-white px-3 py-3 text-[15px] text-black outline-none placeholder:text-gray-400"
        />
      );
    }

    return null;
  }

  function renderCoachHint() {
    if (!coachEnabled || coachStep !== "form") return null;
    if (coachContextLine) {
      return (
        <p className="rounded-2xl border border-[#FF1E2D]/15 bg-[#FF1E2D]/[0.05] px-4 py-3 text-[13px] font-medium leading-relaxed text-app-text">
          {coachContextLine}
        </p>
      );
    }
    if (sportContext.case === "single_common") {
      return <p className="text-[13px] leading-relaxed text-app-muted">{t("assistant_splove_plus_case_single")}</p>;
    }
    if (sportContext.case === "multiple_common") {
      return <p className="text-[13px] leading-relaxed text-app-muted">{t("assistant_splove_plus_case_multiple")}</p>;
    }
    if (sportContext.case === "no_common") {
      return (
        <p className="text-[13px] leading-relaxed text-app-muted">{t("assistant_splove_plus_case_none_combined")}</p>
      );
    }
    return null;
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="create-meetup-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/45 px-3 pb-0 pt-[max(2.5rem,env(safe-area-inset-top))] backdrop-blur-[3px] sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-meetup-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.form
            key="create-meetup-sheet"
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            onSubmit={(e) => void handleSubmit(e)}
            className="mb-safe max-h-[min(92vh,680px)] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-app-card shadow-2xl ring-1 ring-white/[0.06] sm:rounded-3xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-app-border/70 bg-app-card/95 px-5 pb-4 pt-5 backdrop-blur-md">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-app-border/80 sm:hidden" aria-hidden />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 id="create-meetup-title" className="text-[17px] font-bold tracking-tight text-app-text">
                    {modalTitle}
                  </h2>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-app-muted">{modalSubtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-full px-2.5 py-1 text-sm font-medium text-app-muted transition hover:bg-app-border hover:text-app-text"
                >
                  {t("close")}
                </button>
              </div>
              {showCoachBanner ? (
                <div className="mt-3 rounded-2xl border border-[#FF1E2D]/15 bg-gradient-to-r from-[#FF1E2D]/[0.07] to-transparent px-3.5 py-2.5">
                  <p className="text-[12px] font-medium leading-snug text-app-text">
                    ✨ {t("coach_splove_plus_banner")}
                  </p>
                </div>
              ) : null}
            </div>

            {showPreviewStep ? (
              <CoachSplovePlusPreview
                sport={resolvedSport}
                dateLabel={coachDateLabel}
                timeLabel={coachTimeLabel}
                place={place}
                message={coachPreviewQuote}
                compatibility={coachCompatibility.level}
                priorityEnabled={priorityEnabled}
                onPriorityChange={setPriorityEnabled}
                sending={sending}
                error={error}
                onEdit={openCoachForm}
                onSubmit={() => void submitMeetup()}
              />
            ) : (
            <div className="space-y-6 px-5 py-6">
              <section className="space-y-3">
                {renderCoachHint()}
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-app-muted">
                    {t("activity_modal_label_sport")}
                  </label>
                  {renderSportField()}
                </div>
              </section>

              <section className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-app-muted">
                      {t("assistant_splove_plus_label_date")}
                    </label>
                    <input
                      type="date"
                      value={dateLocal}
                      onChange={(e) => setDateLocal(e.target.value)}
                      className="w-full rounded-2xl border border-app-border bg-app-card px-3 py-3 text-[15px] text-app-text outline-none focus:ring-2 focus:ring-[#FF1E2D]/25"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-app-muted">
                      {t("assistant_splove_plus_label_time")}
                    </label>
                    <input
                      type="time"
                      value={timeLocal}
                      onChange={(e) => setTimeLocal(e.target.value)}
                      className="w-full rounded-2xl border border-app-border bg-app-card px-3 py-3 text-[15px] text-app-text outline-none focus:ring-2 focus:ring-[#FF1E2D]/25"
                    />
                  </div>
                </div>

                {displaySuggestedSlots.length > 0 ? (
                  <div>
                    {coachEnabled ? (
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-app-muted">
                        {t("coach_splove_plus_slots_label")}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {displaySuggestedSlots.slice(0, 3).map((iso) => {
                        const d = new Date(iso);
                        if (Number.isNaN(d.getTime())) return null;
                        const parts = splitScheduledAt(iso);
                        const label = d.toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" });
                        return (
                          <button
                            key={iso}
                            type="button"
                            onClick={() => {
                              setDateLocal(parts.date);
                              setTimeLocal(parts.time);
                            }}
                            className="rounded-full border border-app-border bg-app-bg/80 px-3 py-1.5 text-[12px] font-medium text-app-text transition hover:bg-app-border"
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </section>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-app-muted">
                  {t("activity_modal_label_place")}{" "}
                  <span className="font-normal normal-case">{t("activity_modal_optional")}</span>
                </label>
                {coachEnabled && placeSuggestions.length > 0 ? (
                  <div className="mb-2">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-app-muted">
                      {t("coach_splove_plus_places_label")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {placeSuggestions.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPlace(p)}
                          className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
                            place.trim() === p
                              ? "border-[#FF1E2D]/35 bg-[#FF1E2D]/[0.08] text-[#FF1E2D]"
                              : "border-app-border bg-app-bg/80 text-app-text hover:bg-app-border"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <input
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder={t("activity_modal_placeholder_place")}
                  className="w-full rounded-2xl border border-app-border bg-app-card px-3 py-3 text-[15px] text-app-text outline-none focus:ring-2 focus:ring-[#FF1E2D]/25"
                />
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-app-muted">
                  {coachEnabled ? t("assistant_splove_plus_label_message") : t("message")}{" "}
                  {!coachEnabled ? (
                    <span className="font-normal normal-case">{t("activity_modal_message_optional")}</span>
                  ) : null}
                </label>
                {coachEnabled ? (
                  <textarea
                    value={message}
                    onChange={(e) => {
                      setMessageTouched(true);
                      setMessage(e.target.value);
                    }}
                    rows={5}
                    className="w-full resize-none rounded-2xl border border-app-border bg-app-bg/40 px-3.5 py-3 text-[15px] leading-relaxed text-app-text outline-none focus:ring-2 focus:ring-[#FF1E2D]/25"
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {QUICK_NOTE_CHIP_KEYS.map((key) => {
                        const q = t(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              setNoteText(q);
                              setShowCustomNote(false);
                            }}
                            className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${
                              noteText === q
                                ? "border-[#FF1E2D]/40 bg-[#FF1E2D]/8 text-[#FF1E2D]"
                                : "border-app-border bg-app-bg/80 text-app-text hover:bg-app-border"
                            }`}
                          >
                            {q}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCustomNote((v) => !v)}
                      className="mt-2 text-[13px] font-medium text-[#FF1E2D] underline-offset-2 hover:underline"
                    >
                      {showCustomNote ? t("activity_modal_hide_custom") : t("activity_modal_customize_message")}
                    </button>
                    {showCustomNote ? (
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        rows={2}
                        placeholder={t("activity_modal_placeholder_phrase")}
                        className="mt-2 w-full resize-none rounded-2xl border border-app-border bg-app-card px-3 py-2.5 text-[15px] leading-relaxed text-app-text outline-none focus:ring-2 focus:ring-[#FF1E2D]/25"
                      />
                    ) : null}
                  </>
                )}
              </div>

              {coachEnabled ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-app-border/80 bg-app-bg/40 px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={priorityEnabled}
                    onChange={(e) => setPriorityEnabled(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#FF1E2D]"
                  />
                  <span className="text-[13px] leading-snug text-app-text">{t("create_meetup_priority_option")}</span>
                </label>
              ) : null}

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  type="submit"
                  disabled={sending || !canSubmit}
                  className="w-full rounded-2xl px-4 py-3.5 text-[15px] font-semibold shadow-sm transition hover:opacity-95 disabled:opacity-60"
                  style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
                >
                  {sending ? t("sending") : t("assistant_splove_plus_submit")}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl border border-app-border bg-app-card px-4 py-2.5 text-[14px] font-medium text-app-muted transition hover:bg-app-border"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
            )}
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
