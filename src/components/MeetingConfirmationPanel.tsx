import { useEffect, useMemo, useRef, useState } from "react";
import type { Language } from "../i18n";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { useTranslation } from "../i18n/useTranslation";
import { defaultMeetupEngagement } from "../lib/meetupEngagementCore";
import { finalizeMeetupEngagementPayload } from "../lib/meetupEngagement";
import {
  normalizeMeetupTimeHm,
  toHm,
  toYmd,
  tryParseDateTimeFromProposalTimeSlot,
  type MeetupConfirmationPayload,
} from "../lib/meetupConfirmation";
import { saveMeetupConfirmation } from "../services/meetupConfirmation.service";

export type MeetingConfirmationPanelProps = {
  proposalId: string;
  conversationId: string;
  currentUserId: string;
  /** Autre participant — recalcul `both_confirmed`. */
  otherParticipantId?: string | null;
  sport: string;
  timeSlot: string;
  initialLocation?: string | null;
  /** Pré-remplissage (ex. « Modifier »). */
  meetupDraft?: MeetupConfirmationPayload | null;
  language: Language;
  onSaved: () => void | Promise<void>;
};

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function tomorrowAtHours(from: Date, h: number, m: number): Date {
  const d = addDays(from, 1);
  d.setHours(h, m, 0, 0);
  return d;
}

function nextSaturdayMorning(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay();
  let until = (6 - day + 7) % 7;
  if (until === 0) until = 7;
  d.setDate(d.getDate() + until);
  d.setHours(10, 0, 0, 0);
  return d;
}

function toDatetimeLocalValue(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function MeetingConfirmationPanel({
  proposalId,
  conversationId,
  currentUserId,
  otherParticipantId = null,
  sport,
  timeSlot,
  initialLocation,
  meetupDraft = null,
  language,
  onSaved,
}: MeetingConfirmationPanelProps) {
  const { t } = useTranslation();
  const basis = useMemo(() => new Date(), []);

  const locationInit = typeof initialLocation === "string" ? initialLocation.trim() : "";
  const draftLocation =
    typeof meetupDraft?.location === "string" && meetupDraft.location.trim() ? meetupDraft.location.trim() : "";
  const locationSeed = draftLocation || locationInit;

  const presets = useMemo(() => {
    const list: { id: string; slotLabel: string; ymd: string; hm: string }[] = [];

    const fromProposal = tryParseDateTimeFromProposalTimeSlot(timeSlot);
    if (fromProposal) {
      const ymd = toYmd(fromProposal);
      const hm = normalizeMeetupTimeHm(toHm(fromProposal));
      if (hm) {
        list.push({
          id: "proposal",
          slotLabel: timeSlot.trim() || "—",
          ymd,
          hm,
        });
      }
    }

    const t1 = tomorrowAtHours(basis, 18, 30);
    list.push({
      id: "tomorrow_ev",
      slotLabel: "",
      ymd: toYmd(t1),
      hm: "18:30",
    });

    const sat = nextSaturdayMorning(basis);
    list.push({
      id: "sat_am",
      slotLabel: "",
      ymd: toYmd(sat),
      hm: "10:00",
    });

    const seen = new Set<string>();
    return list.filter((p) => {
      const k = `${p.ymd}|${p.hm}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [basis, timeSlot]);

  const [step, setStep] = useState<"when" | "where">("when");
  const firstPresetRef = useRef<string | undefined>(presets[0]?.id);
  firstPresetRef.current = presets[0]?.id ?? firstPresetRef.current;

  const [selectedPresetId, setSelectedPresetId] = useState(firstPresetRef.current ?? "tomorrow_ev");
  useEffect(() => {
    const firstId = presets[0]?.id;
    if (!firstId) return;
    setSelectedPresetId((prev) => (presets.some((p) => p.id === prev) ? prev : firstId));
  }, [presets]);

  const draftDatetimeLocal = useMemo(() => {
    const d = meetupDraft;
    if (!d?.date || !d?.time) return null;
    const dt = new Date(`${d.date}T${d.time}:00`);
    if (Number.isNaN(dt.getTime())) return null;
    return toDatetimeLocalValue(dt);
  }, [meetupDraft?.date, meetupDraft?.time]);

  const [useCustomTime, setUseCustomTime] = useState(() => Boolean(draftDatetimeLocal));
  const [customDatetime, setCustomDatetime] = useState(
    () => draftDatetimeLocal ?? toDatetimeLocalValue(tomorrowAtHours(basis, 18, 30)),
  );

  useEffect(() => {
    if (useCustomTime && !customDatetime.trim()) {
      setCustomDatetime(toDatetimeLocalValue(tomorrowAtHours(new Date(), 18, 30)));
    }
  }, [useCustomTime, customDatetime]);

  const [placePreset, setPlacePreset] = useState<"sport" | "cafe" | "proposal" | "custom">(() =>
    meetupDraft ? "custom" : locationInit ? "proposal" : "sport",
  );
  const [locationDraft, setLocationDraft] = useState(locationSeed || "");

  const activePreset = presets.find((p) => p.id === selectedPresetId) ?? presets[0];
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const dateLocaleShort: Intl.DateTimeFormatOptions =
    language === "en"
      ? { weekday: "short", day: "numeric", month: "short" }
      : { weekday: "short", day: "numeric", month: "short" };

  const presetPlaceSport = useMemo(() => t("meetup_confirmation.place_preset_sport"), [t]);
  const presetPlaceCafe = useMemo(() => t("meetup_confirmation.place_preset_cafe"), [t]);

  function resolveSlot(): { ymd: string; hm: string } | null {
    if (useCustomTime) {
      const raw = customDatetime.trim();
      if (!raw) return null;
      const dt = new Date(raw);
      if (Number.isNaN(dt.getTime())) return null;
      const ymd = toYmd(dt);
      const hm = normalizeMeetupTimeHm(toHm(dt));
      return hm ? { ymd, hm } : null;
    }
    if (!activePreset) return null;
    return { ymd: activePreset.ymd, hm: activePreset.hm };
  }

  function resolveLocation(): string | null {
    if (placePreset === "sport") return presetPlaceSport;
    if (placePreset === "cafe") return presetPlaceCafe;
    const d = locationDraft.trim();
    return d || null;
  }

  async function handleConfirm() {
    setLocalError(null);
    const slot = resolveSlot();
    if (!slot) {
      setLocalError(t("meetup_confirmation.err_time"));
      return;
    }
    const location = resolveLocation();
    if (!location?.trim()) {
      setLocalError(t("meetup_confirmation.err_place"));
      return;
    }

    const sportLine = (meetupDraft?.sport ?? sport).trim();

    const payloadRaw: MeetupConfirmationPayload = {
      sport: sportLine,
      date: slot.ymd,
      time: slot.hm,
      location,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by_user_id: currentUserId,
      engagement: defaultMeetupEngagement(),
    };

    const payload = finalizeMeetupEngagementPayload(
      payloadRaw,
      currentUserId,
      otherParticipantId ?? null,
    );

    setBusy(true);
    try {
      await saveMeetupConfirmation({
        proposalId,
        conversationId,
        senderId: currentUserId,
        payload,
      });
      await onSaved();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : t("meetup_confirmation.err_generic"));
    } finally {
      setBusy(false);
    }
  }

  function formatShortDate(isoDay: string, hm: string): string {
    const dt = new Date(`${isoDay}T${hm}`);
    const dPart = dt.toLocaleDateString(language === "en" ? "en-GB" : "fr-FR", dateLocaleShort);
    return `${dPart} · ${hm}`;
  }

  return (
    <div className="rounded-2xl border border-[#FF1E2D]/35 bg-black/35 px-4 py-4 shadow-inner ring-1 ring-white/[0.06]">
      <p className="text-center text-[13px] font-semibold leading-snug text-white">{t("meetup_confirmation.accepted_nudge")}</p>

      {step === "when" ? (
        <div className="mt-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/65">{t("meetup_confirmation.step_when")}</p>
          {!useCustomTime ? (
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => {
                const primary =
                  p.id === "proposal"
                    ? t("meetup_confirmation.time_as_proposal", { slot: p.slotLabel })
                    : p.id === "tomorrow_ev"
                      ? t("meetup_confirmation.time_preset_tomorrow_1830")
                      : t("meetup_confirmation.time_preset_saturday_10");

                const sub = formatShortDate(p.ymd, p.hm);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPresetId(p.id);
                      setLocalError(null);
                    }}
                    className={`min-h-[3.25rem] min-w-[8.25rem] max-w-[12rem] shrink-0 rounded-xl border px-3 py-2 text-left text-[11px] font-semibold leading-tight shadow-sm transition sm:text-[12px] ${
                      selectedPresetId === p.id
                        ? "border-[#FF1E2D] bg-[#FF1E2D]/22 text-white ring-2 ring-[#FF1E2D]/35"
                        : "border-white/22 bg-black/40 text-white/92 hover:border-white/42"
                    }`}
                  >
                    <span className="block">{primary}</span>
                    <span className="mt-1 block font-normal opacity-84">{sub}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <label className="flex cursor-pointer flex-wrap items-center gap-2 text-[13px] font-medium text-white/95">
            <input
              type="checkbox"
              checked={useCustomTime}
              onChange={(ev) => {
                setUseCustomTime(ev.target.checked);
                setLocalError(null);
              }}
              className="h-4 w-4 rounded border-white/40 text-[#FF1E2D] focus:ring-[#FF1E2D]/40"
            />
            {t("meetup_confirmation.time_custom")}
          </label>
          {useCustomTime ? (
            <input
              type="datetime-local"
              value={customDatetime}
              onChange={(e) => setCustomDatetime(e.target.value)}
              className="w-full rounded-xl border border-white/22 bg-black/55 px-3 py-2.5 text-[15px] text-white outline-none focus:ring-2 focus:ring-[#FF1E2D]/35"
            />
          ) : null}
          <button
            type="button"
            onClick={() => {
              const s = resolveSlot();
              if (!s) {
                setLocalError(t("meetup_confirmation.err_time"));
                return;
              }
              setStep("where");
              setLocalError(null);
            }}
            className="mt-2 w-full rounded-xl py-3 text-[14px] font-bold transition hover:opacity-95"
            style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
          >
            {t("meetup_confirmation.next")}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/65">{t("meetup_confirmation.step_where")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPlacePreset("sport")}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
                placePreset === "sport"
                  ? "border-emerald-300/58 bg-emerald-900/50 text-emerald-50 ring-2 ring-emerald-300/32"
                  : "border-white/25 bg-black/35 text-white/90 hover:border-white/40"
              }`}
            >
              {presetPlaceSport}
            </button>
            <button
              type="button"
              onClick={() => setPlacePreset("cafe")}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
                placePreset === "cafe"
                  ? "border-emerald-300/58 bg-emerald-900/50 text-emerald-50 ring-2 ring-emerald-300/32"
                  : "border-white/25 bg-black/35 text-white/90 hover:border-white/40"
              }`}
            >
              {presetPlaceCafe}
            </button>
            {locationInit ? (
              <button
                type="button"
                onClick={() => {
                  setPlacePreset("proposal");
                  setLocationDraft(locationInit);
                }}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
                  placePreset === "proposal"
                    ? "border-emerald-300/58 bg-emerald-900/50 text-emerald-50 ring-2 ring-emerald-300/32"
                    : "border-white/25 bg-black/35 text-white/90 hover:border-white/40"
                }`}
              >
                {t("meetup_confirmation.place_preset_proposed")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setPlacePreset("custom")}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
                placePreset === "custom"
                  ? "border-emerald-300/58 bg-emerald-900/50 text-emerald-50 ring-2 ring-emerald-300/32"
                  : "border-white/25 bg-black/35 text-white/90 hover:border-white/40"
              }`}
            >
              {t("meetup_confirmation.place_preset_custom")}
            </button>
          </div>
          {(placePreset === "custom" || placePreset === "proposal") && (
            <textarea
              value={locationDraft}
              onChange={(e) => setLocationDraft(e.target.value)}
              placeholder={t("meetup_confirmation.place_placeholder")}
              rows={2}
              className="w-full resize-y rounded-xl border border-white/28 bg-black/52 px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-white/38 focus:ring-2 focus:ring-[#FF1E2D]/38"
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep("when")}
              className="flex-1 rounded-xl border border-white/24 bg-transparent py-3 text-[14px] font-semibold text-white/95 transition hover:bg-white/12"
            >
              {t("meetup_confirmation.back")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleConfirm()}
              className="flex-[1.4] rounded-xl py-3 text-[14px] font-bold transition hover:opacity-95 disabled:opacity-55"
              style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
            >
              {busy ? t("meetup_confirmation.saving") : t("meetup_confirmation.confirm_btn")}
            </button>
          </div>
        </div>
      )}

      {localError ? <p className="mt-2 text-center text-[12px] font-medium text-red-400">{localError}</p> : null}
    </div>
  );
}
