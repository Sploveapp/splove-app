import { Link } from "react-router-dom";
import type { MeetupConfirmationPayload } from "../lib/meetupConfirmation";
import {
  buildMeetupIcsCalendar,
  downloadTextFile,
  googleMapsSearchUrl,
} from "../lib/meetupConfirmation";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { useTranslation } from "../i18n/useTranslation";

type Props = {
  payload: MeetupConfirmationPayload;
  /** Pour UID stable du fichier ICS. */
  proposalId: string;
  /** Accent visuel titre (confirmation vs relecture après sortie). */
  headlineTone?: "celebrate" | "neutral";
  /** Synthèse discrète (ex. après bilan). */
  subtle?: boolean;
};

export function MeetingConfirmedCard({
  payload,
  proposalId,
  headlineTone = "celebrate",
  subtle = false,
}: Props) {
  const { t, language } = useTranslation();
  const locale = language === "en" ? "en-GB" : "fr-FR";

  const datePretty = new Date(`${payload.date}T12:00:00`).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const uid = `${proposalId}-${payload.confirmed_at}`.replace(/[^a-zA-Z0-9@-]/g, "-");
  const summary = `${payload.sport}`;

  const handleCalendar = () => {
    const ics = buildMeetupIcsCalendar({
      uid,
      sport: payload.sport,
      dateYmd: payload.date,
      timeHm: payload.time,
      location: payload.location,
      summary,
    });
    if (!ics) return;
    downloadTextFile("splove-meetup.ics", ics, "text/calendar;charset=utf-8");
  };

  const mapsHref = googleMapsSearchUrl(payload.location);

  const borderWrap =
    headlineTone === "neutral"
      ? "border-emerald-500/28 bg-emerald-950/22 ring-emerald-500/15"
      : "border-emerald-400/35 bg-emerald-950/30 ring-emerald-400/20";
  const headMain =
    headlineTone === "neutral" ? (
      <>
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-200/88">
          {t("meetup_confirmed.card_kicker")}
        </p>
        <h3 className="mt-2 text-center text-[1.1rem] font-bold leading-snug tracking-tight text-emerald-50">
          {t("meetup_confirmed.card_title")}
        </h3>
      </>
    ) : (
      <h3 className="text-center text-[1.15rem] font-bold leading-snug tracking-tight text-emerald-50">
        {t("meetup_engagement.confirmed_headline")}
      </h3>
    );

  return (
    <div
      className={`rounded-2xl border px-4 py-4 shadow-sm ring-1 ${borderWrap}${subtle ? "" : " mb-3"}`}
    >
      {!subtle ? headMain : null}
      {subtle ? (
        <p className="text-center text-[12px] font-semibold uppercase tracking-wide text-emerald-200/80">
          {t("meetup_confirmed.card_title")}
        </p>
      ) : null}
      <dl className="mt-4 space-y-2 rounded-xl border border-emerald-500/25 bg-black/25 px-3 py-3 text-left">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/85">
            {t("meetup_confirmed.sport_label")}
          </dt>
          <dd className="text-[13px] font-semibold text-emerald-50">{payload.sport}</dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/85">
            {t("meetup_confirmed.date_label")}
          </dt>
          <dd className="text-[13px] text-emerald-100">{datePretty}</dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/85">
            {t("meetup_confirmed.time_label")}
          </dt>
          <dd className="text-[13px] font-medium text-emerald-100">{payload.time}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/85">
            {t("meetup_confirmed.place_label")}
          </dt>
          <dd className="text-[13px] leading-snug text-emerald-50">{payload.location}</dd>
        </div>
      </dl>
      {!subtle ? (
        <div className="mt-4 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handleCalendar}
            className="w-full rounded-xl py-3 text-[14px] font-bold shadow-md transition hover:opacity-95"
            style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
          >
            {t("meetup_confirmed.add_calendar")}
          </button>
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-xl border border-emerald-400/40 bg-emerald-950/40 py-3 text-center text-[14px] font-semibold text-emerald-100 transition hover:bg-emerald-950/65"
          >
            {t("meetup_confirmed.view_place")}
          </a>
          <Link
            to="/mes-rencontres"
            className="block w-full rounded-xl border border-emerald-500/30 py-2.5 text-center text-[13px] font-semibold text-emerald-200/95 transition hover:bg-emerald-500/15"
          >
            {t("chat_see_meetups")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
