import {
  memo,
  useCallback,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BRAND_BG, TEXT_ON_BRAND } from "../../constants/theme";
import {
  IconBanSoft,
  IconHeartFilled,
  IconPass,
  IconProfileAvatarPlaceholder,
} from "../ui/Icon";
import { VerifiedBadge } from "../VerifiedBadge";
import { isPhotoVerified } from "../../lib/profileVerification";
import { hasSharedPlace } from "../../lib/sharedPlaceTeaser";
import {
  filterDiscoverReasonsForDisplay,
  intentLabelShort,
  softAreaHint,
} from "../../lib/discoverCardCopy";
import { buildDiscoverLocationLines } from "../../utils/geolocation";
import { getDiscoverSportChips } from "../../lib/sportMatchGroups";
import {
  getIRLPrompt,
  getSharedSport,
  shouldShowDiscoverActiveTodayBadge,
} from "../../lib/discoverProfileCardHelpers";
import { parseSportPracticePace, sportPracticePaceI18nKey } from "../../lib/sportPracticePace";
import { useTranslation } from "../../i18n/useTranslation";
import { BLOCK_PROFILE_LINK_LABEL, REPORT_LINK_LABEL } from "../../constants/copy";

export type DiscoverProfileCardModel = {
  id: string;
  first_name: string | null;
  city?: string | null;
  birth_date?: string | null;
  intent?: string | null;
  sport_phrase?: string | null;
  sport_feeling?: string | null;
  sport_time?: string | null;
  portrait_url?: string | null;
  fullbody_url?: string | null;
  avatar_url?: string | null;
  main_photo_url?: string | null;
  profile_sports?: { sports: { label: string | null; slug?: string | null } | null }[];
  distanceKm?: number | null;
  /** Clés vivantes — alignées sur Discover.tsx */
  commonSportsCount: number;
  discover_reasons: string[];
  activity_label?: string | null;
  last_active_at?: string | null;
  is_boost_active?: boolean | null;
  is_active_mode?: boolean | null;
  has_shared_place?: boolean;
  is_photo_verified?: boolean | null;
  photo_status?: string | null;
  sport_practice_type?: string | null;
};

export type DiscoverProfileCardProps = {
  profile: DiscoverProfileCardModel;
  viewerCity: string | null;
  mySportMatchKeys: Set<string>;
  photoUrl: string;
  discoverMenuProfileId: string | null;
  setDiscoverMenuProfileId: Dispatch<SetStateAction<string | null>>;
  restoredProfileId: string | null;
  dx: number;
  swipeZoneStyle: CSSProperties;
  onSwipeZonePointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onSwipeZonePointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onSwipeZonePointerUp: (e: PointerEvent<HTMLDivElement>) => void;
  onSwipeZonePointerCancel: (e: PointerEvent<HTMLDivElement>) => void;
  onOpenDetail: () => void;
  onBlock: (id: string) => void | Promise<void>;
  onReportPhoto: () => void;
  onPass: (decisionTimeMs?: number) => void;
  onLike: (decisionTimeMs?: number) => void | Promise<void>;
  onUndo: () => void;
  canUndo: boolean;
  onReport: () => void;
};

const REWIND_BTN_BG = "#1F1F24";
const REWIND_ACCENT = "#D1003F";

export const DiscoverProfileCard = memo(function DiscoverProfileCard({
  profile,
  viewerCity,
  mySportMatchKeys,
  photoUrl,
  discoverMenuProfileId,
  setDiscoverMenuProfileId,
  restoredProfileId,
  dx,
  swipeZoneStyle,
  onSwipeZonePointerDown,
  onSwipeZonePointerMove,
  onSwipeZonePointerUp,
  onSwipeZonePointerCancel,
  onOpenDetail,
  onBlock,
  onReportPhoto,
  onPass,
  onLike,
  onUndo,
  canUndo,
  onReport,
}: DiscoverProfileCardProps) {
  const { t } = useTranslation();
  const age = useAge(profile.birth_date);
  const showActiveTodayBadge = shouldShowDiscoverActiveTodayBadge(profile);
  const sharedSportLabel = getSharedSport(profile, mySportMatchKeys);
  const sharedSportBadge = sharedSportLabel != null && profile.commonSportsCount > 0;
  const practicePaceKey = sportPracticePaceI18nKey(parseSportPracticePace(profile.sport_practice_type));
  const showReadyToMoveBadge = profile.is_active_mode === true;
  const phraseTrim = (profile.sport_phrase ?? "").trim();
  const irlLine = getIRLPrompt(profile, mySportMatchKeys, {
    realOutingIntent: t("discover.real_outing_intent"),
    genericFallback: t("discover.profileCard_irlFallback"),
  });
  const locLines = buildDiscoverLocationLines({
    distanceKm: profile.distanceKm ?? null,
    viewerCity,
    profileCity: profile.city ?? null,
    labels: {
      zoneHintPrefix: t("discover.zone_hint"),
      sameSector: t("discover.same_sector"),
    },
  });
  const areaHint = softAreaHint(viewerCity, profile.city, {
    nearby: t("discover.nearby_area_hint"),
    twoSectors: t("discover.two_sectors_hint"),
  });
  const discoverReasonsDisplay = filterDiscoverReasonsForDisplay(
    profile.discover_reasons ?? [],
    locLines.line1,
  );
  const intentShort = intentLabelShort(profile.intent);
  const sportChips = getDiscoverSportChips(profile, mySportMatchKeys);
  const strongAffinity = profile.commonSportsCount >= 2;

  const [tapFeedback, setTapFeedback] = useState<null | "pass" | "like">(null);
  const triggerPass = useCallback(() => {
    setTapFeedback("pass");
    window.setTimeout(() => setTapFeedback(null), 320);
    onPass(0);
  }, [onPass]);
  const triggerLike = useCallback(() => {
    setTapFeedback("like");
    window.setTimeout(() => setTapFeedback(null), 320);
    void onLike(0);
  }, [onLike]);

  const passPreview = dx < -18;
  const likePreview = dx > 18;
  const swipeNopeOpacity = Math.min(1, Math.abs(dx) / 120) * (passPreview ? 1 : 0);
  const swipeLikeOpacity = Math.min(1, Math.abs(dx) / 120) * (likePreview ? 1 : 0);

  return (
    <>
      <div
        className="relative min-h-[min(58vh,420px)] w-full flex-[1] basis-0 cursor-grab touch-none bg-zinc-950 active:cursor-grabbing sm:min-h-[min(52vh,480px)]"
        style={swipeZoneStyle}
        onPointerDown={onSwipeZonePointerDown}
        onPointerMove={onSwipeZonePointerMove}
        onPointerUp={onSwipeZonePointerUp}
        onPointerCancel={onSwipeZonePointerCancel}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={
              profile.first_name
                ? t("discover.profileCard_photoAlt", { name: profile.first_name })
                : t("profile_photo")
            }
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center bg-app-border"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail();
            }}
          >
            <IconProfileAvatarPlaceholder className="text-app-muted/80" size={88} />
          </button>
        )}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/92"
          aria-hidden
        />
        <AnimatePresence>
          {tapFeedback === "pass" ? (
            <motion.div
              key="tap-pass"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ duration: 0.22 }}
              className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center bg-rose-600/25"
            >
              <span className="rotate-[-12deg] rounded-xl border-4 border-white/90 px-4 py-2 text-xl font-black uppercase tracking-widest text-white drop-shadow-lg">
                {t("discover.profileCard_passStamp")}
              </span>
            </motion.div>
          ) : null}
          {tapFeedback === "like" ? (
            <motion.div
              key="tap-like"
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.06 }}
              transition={{ duration: 0.24 }}
              className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center bg-emerald-500/20"
            >
              <motion.div
                initial={{ scale: 0.5 }}
                animate={{ scale: [0.92, 1.12, 1] }}
                transition={{ duration: 0.35 }}
                className="flex h-24 w-24 items-center justify-center rounded-full shadow-[0_0_40px_rgba(255,30,45,0.45)] ring-4 ring-white/90"
                style={{ background: BRAND_BG }}
              >
                <IconHeartFilled size={44} color={TEXT_ON_BRAND} />
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {swipeNopeOpacity > 0.04 ? (
          <div
            className="pointer-events-none absolute inset-0 z-[14] flex items-center justify-center bg-rose-500/20 transition-opacity duration-75"
            style={{ opacity: swipeNopeOpacity }}
            aria-hidden
          >
            <span className="rotate-[-14deg] text-2xl font-black uppercase tracking-widest text-white/95 drop-shadow-lg">
              {t("discover.profileCard_swipePass")}
            </span>
          </div>
        ) : null}
        {swipeLikeOpacity > 0.04 ? (
          <div
            className="pointer-events-none absolute inset-0 z-[14] flex items-center justify-center bg-emerald-500/15 transition-opacity duration-75"
            style={{ opacity: swipeLikeOpacity }}
            aria-hidden
          >
            <span className="rotate-[12deg] text-2xl font-black uppercase tracking-widest text-white drop-shadow-[0_0_18px_rgba(255,30,45,0.75)]">
              {t("discover.profileCard_swipeLike")}
            </span>
          </div>
        ) : null}

        {restoredProfileId === profile.id ? (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[18] -translate-x-1/2 rounded-full bg-emerald-600/95 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-md backdrop-blur-sm">
            {t("discover_second_chance_badge")}
          </div>
        ) : null}
        {strongAffinity ? (
          <div
            className={`pointer-events-none absolute left-3 z-[18] rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-md backdrop-blur-sm ${
              restoredProfileId === profile.id ? "top-12" : "top-3"
            }`}
          >
            {t("discover.profileCard_multiSports")}
          </div>
        ) : null}

        <div className="absolute right-2 top-2 z-[20]" data-discover-menu-root>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={discoverMenuProfileId === profile.id}
            aria-label={t("more_actions")}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setDiscoverMenuProfileId((id) => (id === profile.id ? null : profile.id));
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-lg font-bold leading-none text-white backdrop-blur-sm ring-1 ring-white/25 hover:bg-black/55"
          >
            ⋯
          </button>
          {discoverMenuProfileId === profile.id ? (
            <div
              role="menu"
              className="absolute right-0 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-app-border/90 bg-app-card py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-app-text hover:bg-app-border"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => void onBlock(profile.id)}
              >
                <IconBanSoft size={18} className="shrink-0 text-app-muted" />
                {BLOCK_PROFILE_LINK_LABEL}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-app-text hover:bg-app-border"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setDiscoverMenuProfileId(null);
                  onReportPhoto();
                }}
              >
                {t("report_photo")}
              </button>
            </div>
          ) : null}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[10] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-28">
          <div className="flex flex-wrap gap-1.5 px-4">
            {showActiveTodayBadge ? (
              <span className="rounded-full bg-white/14 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-100 ring-1 ring-emerald-300/55 backdrop-blur-sm">
                {t("discover.profileCard_badgeActiveToday")}
              </span>
            ) : null}
            {sharedSportBadge ? (
              <span className="rounded-full bg-[#FF1E2D]/35 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white ring-1 ring-white/35 backdrop-blur-sm">
                {t("discover.profileCard_badgeSharedSport")}
              </span>
            ) : null}
            {showReadyToMoveBadge ? (
              <span className="rounded-full bg-amber-400/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-50 ring-1 ring-amber-200/50 backdrop-blur-sm">
                {t("discover.profileCard_badgeReadyToMove")}
              </span>
            ) : null}
            {hasSharedPlace(profile) ? (
              <span className="rounded-full bg-white/12 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-white/95 ring-1 ring-amber-200/40 backdrop-blur-sm">
                {t("discover.profileCard_sharedSpot")}
              </span>
            ) : null}
            {isPhotoVerified(profile) ? (
              <span className="pointer-events-none inline-flex">
                <VerifiedBadge
                  variant="compact"
                  className="!bg-white/95 !normal-case !tracking-normal !text-emerald-900 !ring-emerald-500/35"
                />
              </span>
            ) : null}
          </div>

          <div className="mt-2.5 px-4">
            <div className="flex flex-wrap items-end gap-2">
              <h2 className="text-[1.75rem] font-extrabold leading-none tracking-tight text-white drop-shadow-md sm:text-[2rem]">
                {profile.first_name ?? t("unnamed_profile")}
                {age != null ? <span className="font-bold text-white/90">, {age}</span> : null}
              </h2>
              {intentShort ? (
                <span className="mb-0.5 rounded-full bg-white/16 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/95 ring-1 ring-white/30">
                  {intentShort}
                </span>
              ) : null}
            </div>
            {sharedSportLabel ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-bold leading-snug text-emerald-200 drop-shadow-md sm:text-base">
                  {t("discover.profileCard_commonSportLead", { sport: sharedSportLabel })}
                </p>
                {practicePaceKey ? (
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/90 ring-1 ring-[#E11D2E]/25 backdrop-blur-sm">
                    {t(practicePaceKey)}
                  </span>
                ) : null}
              </div>
            ) : null}
            {sportChips.length > 0 ? (
              <div className="mt-2 flex max-h-[4.5rem] flex-wrap gap-1 overflow-hidden">
                {sportChips.map(({ label: sportLabel, shared }) => (
                  <span
                    key={sportLabel}
                    className={
                      shared
                        ? "rounded-full bg-emerald-500/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-50 ring-1 ring-emerald-200/50"
                        : "rounded-full bg-white/12 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90 ring-1 ring-white/25"
                    }
                  >
                    {sportLabel}
                  </span>
                ))}
              </div>
            ) : null}
            {discoverReasonsDisplay.length > 0 ? (
              <p className="mt-1.5 line-clamp-2 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                {discoverReasonsDisplay.join(" · ")}
              </p>
            ) : null}
            {locLines.line1 || locLines.line2 ? (
              <div className="mt-2 space-y-0.5">
                {locLines.line1 ? (
                  <p className="text-[13px] font-semibold text-white/90 drop-shadow-sm">{locLines.line1}</p>
                ) : null}
                {locLines.line2 ? (
                  <p className="text-[12px] font-medium text-white/70 drop-shadow-sm">{locLines.line2}</p>
                ) : null}
              </div>
            ) : areaHint ? (
              <p className="mt-2 text-[12px] font-medium text-white/75 drop-shadow-sm">{areaHint}</p>
            ) : profile.city?.trim() ? (
              <p className="mt-2 text-[12px] font-medium text-white/65 drop-shadow-sm">
                {t("discover.zone_hint")} · {profile.city.trim()}
              </p>
            ) : null}
            {phraseTrim ? (
              <div className="mt-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/60">{t("discover.momentWish")}</p>
                <p className="mt-0.5 line-clamp-2 text-[14px] font-medium leading-snug text-white drop-shadow-sm">
                  {phraseTrim.length > 120 ? `${phraseTrim.slice(0, 117)}…` : phraseTrim}
                </p>
              </div>
            ) : null}
            <p className="mt-2 line-clamp-3 text-[14px] font-medium leading-snug text-white/95 drop-shadow-md sm:text-[15px]">
              {irlLine}
            </p>
          </div>

          <div className="pointer-events-auto relative z-[19] mt-5 flex items-center justify-between gap-3 px-5 sm:px-8">
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              transition={{ type: "spring", stiffness: 520, damping: 28 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                triggerPass();
              }}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/35 bg-zinc-900/75 text-white shadow-lg backdrop-blur-md ring-1 ring-white/15"
              aria-label={t("pass")}
            >
              <IconPass size={24} />
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: canUndo ? 0.9 : 1 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (canUndo) onUndo();
              }}
              disabled={!canUndo}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg shadow-lg backdrop-blur-sm disabled:cursor-not-allowed disabled:opacity-35"
              style={{
                backgroundColor: REWIND_BTN_BG,
                color: REWIND_ACCENT,
                boxShadow: `0 4px 20px rgba(0,0,0,0.45), 0 0 0 1px rgba(209,0,63,0.32)`,
              }}
              aria-label={t("discover_undo_action")}
            >
              <span aria-hidden>↩</span>
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              transition={{ type: "spring", stiffness: 460, damping: 24 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                triggerLike();
              }}
              className="flex h-[3.65rem] w-[3.65rem] shrink-0 items-center justify-center rounded-full shadow-[0_4px_24px_rgba(255,30,45,0.45)] ring-2 ring-white/40"
              style={{ background: BRAND_BG }}
              aria-label={t("like")}
            >
              <IconHeartFilled size={30} color={TEXT_ON_BRAND} />
            </motion.button>
          </div>
        </div>
      </div>

      <div className="border-t border-app-border/85 bg-app-card px-3 py-2.5">
        <button
          type="button"
          onClick={onReport}
          className="w-full py-1 text-center text-[11px] font-medium text-app-muted underline decoration-app-border underline-offset-2 hover:text-app-muted"
        >
          {REPORT_LINK_LABEL}
        </button>
      </div>
    </>
  );
});

function useAge(birth_date: string | null | undefined): number | null {
  if (!birth_date) return null;
  const birth = new Date(birth_date);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  if (age < 18 || age > 120) return null;
  return age;
}
