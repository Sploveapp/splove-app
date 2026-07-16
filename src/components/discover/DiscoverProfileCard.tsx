import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent,
  type ReactEventHandler,
  type SetStateAction,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BRAND_BG, TEXT_ON_BRAND } from "../../constants/theme";
import {
  IconBanSoft,
  IconHeartFilled,
  IconPass,
} from "../ui/Icon";
import { DiscoverSportLevelRow } from "./DiscoverSportLevelDots";
import {
  softAreaHint,
} from "../../lib/discoverCardCopy";
import { buildDiscoverLocationLines } from "../../utils/geolocation";
import { getDiscoverSportChips } from "../../lib/sportMatchGroups";
import {
  getIRLPrompt,
} from "../../lib/discoverProfileCardHelpers";
import { useTranslation } from "../../i18n/useTranslation";
import { formatHeightCmForDisplay } from "../../lib/profileHeightCm";
import { formatCityDisplay } from "../../lib/formatCityDisplay";
import { BLOCK_PROFILE_LINK_LABEL, REPORT_LINK_LABEL } from "../../constants/copy";
import { logPhotoDebug } from "../../hooks/useProfilePhotoDisplaySrc";
import { classifyImgSrcForIosDebug, logPhotoIosDebug } from "../../lib/photoIosDebug";
import { logPhotoComponent, logPhotoTrace, logPhotoTraceImgEvent } from "../../lib/photoTraceLog";
import { SplovePlayHeartPicker } from "./SplovePlayHeartPicker";
import { SplovePlayIntroModal } from "./SplovePlayIntroModal";
import type { SplovePlayAccess } from "../../lib/splovePlayAccess";
import type { SplovePlayType } from "../../lib/splovePlay";
import { useAuth } from "../../contexts/AuthContext";
import {
  hasDismissedSplovePlayIntro,
  markSplovePlayIntroDismissed,
} from "../../lib/splovePlayIntroStorage";

export type DiscoverProfileCardModel = {
  id: string;
  first_name: string | null;
  city?: string | null;
  birth_date?: string | null;
  intent?: string | null;
  sport_phrase?: string | null;
  height_cm?: number | null;
  sport_feeling?: string | null;
  portrait_url?: string | null;
  fullbody_url?: string | null;
  avatar_url?: string | null;
  main_photo_url?: string | null;
  profile_sports?: { level?: string | null; sports: { label: string | null; slug?: string | null } | null }[];
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
  identity_verified?: boolean | null;
  veriff_status?: string | null;
  sport_practice_type?: string | null;
};

export type DiscoverProfileCardProps = {
  profile: DiscoverProfileCardModel;
  viewerCity: string | null;
  mySportMatchKeys: Set<string>;
  photoUrl: string;
  /** Résolution photo en cours — évite le placeholder « sans photo » prématuré. */
  photoPending?: boolean;
  /** Badge intention (ex. « Aller plus loin ») — uniquement sur profils tiers. */
  showMeetingIntentBadge?: boolean;
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
  /** Droits Play (résolus une fois au niveau Discover). */
  playAccess: SplovePlayAccess;
  onPass: (decisionTimeMs?: number) => void;
  onLike: (decisionTimeMs?: number, playType?: SplovePlayType) => void | Promise<void>;
  onReport: () => void;
  /** Repli URL photo (public → signée) après échec `<img>`. */
  onPhotoError?: ReactEventHandler<HTMLImageElement>;
  /** Diagnostic `[PhotoRender] img_onload` — sans effet métier. */
  onPhotoLoad?: ReactEventHandler<HTMLImageElement>;
  /** Carte Discover plein focus — photo plus haute, rythme immersif. */
  immersive?: boolean;
};

export const DiscoverProfileCard = memo(function DiscoverProfileCard({
  profile,
  viewerCity,
  mySportMatchKeys,
  photoUrl,
  photoPending = false,
  showMeetingIntentBadge: _showMeetingIntentBadge = true,
  discoverMenuProfileId,
  setDiscoverMenuProfileId,
  restoredProfileId,
  dx,
  swipeZoneStyle,
  onSwipeZonePointerDown,
  onSwipeZonePointerMove,
  onSwipeZonePointerUp,
  onSwipeZonePointerCancel,
  onOpenDetail: _onOpenDetail,
  onBlock,
  onReportPhoto,
  playAccess,
  onPass,
  onLike,
  onReport,
  onPhotoError,
  onPhotoLoad,
  immersive = false,
}: DiscoverProfileCardProps) {
  console.error("[TRACE EXECUTED] DiscoverProfileCard");
  const { t } = useTranslation();
  const { user } = useAuth();
  const [heartPickerOpen, setHeartPickerOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [likeSending, setLikeSending] = useState(false);
  const likePendingRef = useRef(false);
  const playAnchorRef = useRef<HTMLButtonElement>(null);
  const photoZoneRef = useRef<HTMLDivElement>(null);
  const canUsePlayPicker = playAccess.canSendPremiumPlays;
  const playPickerActive = heartPickerOpen && canUsePlayPicker;
  const age = useAge(profile.birth_date);
  const phraseTrim = (profile.sport_phrase ?? "").trim();
  const heightLine = formatHeightCmForDisplay(profile.height_cm ?? null);
  const profileCityPretty = formatCityDisplay(profile.city);
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
  const sportChips = getDiscoverSportChips(profile, mySportMatchKeys).slice(0, 3);
  const strongAffinity = profile.commonSportsCount >= 2;
  const distanceDisplay =
    profile.distanceKm != null && Number.isFinite(profile.distanceKm)
      ? locLines.line1
      : locLines.line1 === t("discover.same_sector")
        ? locLines.line1
        : null;
  const cityDisplay = locLines.line2 ?? profileCityPretty;
  const shortBio = phraseTrim
    ? phraseTrim.length > 120
      ? `${phraseTrim.slice(0, 117)}…`
      : phraseTrim
    : irlLine;
  const locationLine = (() => {
    if (distanceDisplay && cityDisplay) return `📍 ${distanceDisplay} · ${cityDisplay}`;
    if (distanceDisplay) return `📍 ${distanceDisplay}`;
    if (cityDisplay) return `📍 ${cityDisplay}`;
    if (areaHint) return areaHint;
    return null;
  })();
  const descriptionLine = shortBio
    ? shortBio.length > 140
      ? `${shortBio.slice(0, 137)}…`
      : shortBio
    : null;
  const hasDisplayPhoto = Boolean(photoUrl?.trim());
  const hasStoredPhotoRef = Boolean(
    profile.portrait_url?.trim() ||
      profile.main_photo_url?.trim() ||
      profile.avatar_url?.trim() ||
      profile.fullbody_url?.trim(),
  );
  /** Profil avec ref photo mais URL pas encore résolue — évite le fallback prématuré. */
  const awaitingPhotoResolve = !hasDisplayPhoto && (photoPending || hasStoredPhotoRef);

  const [tapFeedback, setTapFeedback] = useState<null | "pass" | "like">(null);

  const triggerClassicLike = useCallback(() => {
    if (likePendingRef.current) return;
    likePendingRef.current = true;
    setLikeSending(true);
    setTapFeedback("like");
    window.setTimeout(() => setTapFeedback(null), 320);
    void Promise.resolve(onLike(0)).finally(() => {
      likePendingRef.current = false;
      setLikeSending(false);
    });
  }, [onLike]);

  const dismissPlayIntro = useCallback(() => {
    markSplovePlayIntroDismissed(user?.id);
    setIntroOpen(false);
  }, [user?.id]);

  /** Bouton flottant sur la photo — Play uniquement (sans Like classique). */
  const handleFloatingPlayClick = useCallback(() => {
    if (likePendingRef.current) return;

    if (canUsePlayPicker) {
      setHeartPickerOpen((open) => !open);
      return;
    }

    if (user?.id && !hasDismissedSplovePlayIntro(user.id)) {
      setIntroOpen(true);
    }
  }, [canUsePlayPicker, user?.id]);

  const closeHeartPicker = useCallback(() => {
    setHeartPickerOpen(false);
  }, []);

  const triggerPass = useCallback(() => {
    setTapFeedback("pass");
    window.setTimeout(() => setTapFeedback(null), 320);
    onPass(0);
  }, [onPass]);

  const handlePlaySelect = useCallback(
    (playType: SplovePlayType) => {
      if (likePendingRef.current) return;
      setHeartPickerOpen(false);
      likePendingRef.current = true;
      setLikeSending(true);
      setTapFeedback("like");
      window.setTimeout(() => setTapFeedback(null), 320);
      void Promise.resolve(onLike(0, playType)).finally(() => {
        likePendingRef.current = false;
        setLikeSending(false);
      });
    },
    [onLike],
  );

  const guardSwipeWhenPlayPicker = useCallback(
    (handler: (e: PointerEvent<HTMLDivElement>) => void) =>
      (e: PointerEvent<HTMLDivElement>) => {
        if (playPickerActive) {
          e.stopPropagation();
          return;
        }
        handler(e);
      },
    [playPickerActive],
  );

  const passPreview = dx < -18;
  const likePreview = dx > 18;
  const swipeNopeOpacity = Math.min(1, Math.abs(dx) / 120) * (passPreview ? 1 : 0);
  const swipeLikeOpacity = Math.min(1, Math.abs(dx) / 120) * (likePreview ? 1 : 0);

  useEffect(() => {
    logPhotoComponent("DiscoverProfileCard.tsx");
  }, []);

  useEffect(() => {
    logPhotoTrace({
      screen: "Discover",
      component: "DiscoverProfileCard.tsx",
      userId: profile.id,
      portrait_url: profile.portrait_url ?? null,
      main_photo_url: profile.main_photo_url ?? null,
      avatar_url: profile.avatar_url ?? null,
      portraitDisplayResolved: null,
      facePreviewSrc: photoUrl ? "set" : "missing",
      finalImgSrc: photoUrl || null,
      extra: { photoPending, hasDisplayPhoto },
    });
  }, [
    profile.id,
    profile.portrait_url,
    profile.main_photo_url,
    profile.avatar_url,
    photoUrl,
    photoPending,
    hasDisplayPhoto,
  ]);

  useEffect(() => {
    logPhotoDebug("screen.render", {
      screen: "Discover",
      profileId: profile.id,
      storedRef:
        profile.portrait_url ??
        profile.main_photo_url ??
        profile.avatar_url ??
        profile.fullbody_url ??
        null,
      displaySrc: photoUrl || null,
      photoFields: {
        portrait_url: profile.portrait_url ?? null,
        avatar_url: profile.avatar_url ?? null,
        fullbody_url: profile.fullbody_url ?? null,
        main_photo_url: profile.main_photo_url ?? null,
      },
      isLoading: photoPending,
      isFailed: !photoUrl && !photoPending,
      extra: {
        hasPhotoUrl: Boolean(photoUrl),
        photoPending,
        profileFirstName: profile.first_name,
      },
    });
  }, [
    photoUrl,
    photoPending,
    profile.id,
    profile.portrait_url,
    profile.main_photo_url,
    profile.avatar_url,
    profile.fullbody_url,
    profile.first_name,
  ]);

  useEffect(() => {
    if (!photoUrl) return;
    logPhotoIosDebug("final_img_src", {
      screen: "Discover",
      profileId: profile.id,
      srcKind: classifyImgSrcForIosDebug(photoUrl),
      phase: "card_mount",
    });
  }, [photoUrl, profile.id]);

  const handlePhotoLoad: ReactEventHandler<HTMLImageElement> = useCallback(
    (event) => {
      logPhotoTraceImgEvent(
        "onLoad",
        {
          screen: "Discover",
          component: "DiscoverProfileCard.tsx",
          userId: profile.id,
          slot: "primary",
          srcReceived: photoUrl || null,
        },
        event.currentTarget,
      );
      logPhotoIosDebug("img_onload", {
        screen: "Discover",
        profileId: profile.id,
        srcKind: classifyImgSrcForIosDebug(photoUrl || event.currentTarget.currentSrc),
        naturalWidth: event.currentTarget.naturalWidth,
      });
      logPhotoDebug("screen.img_onload", {
        screen: "Discover",
        profileId: profile.id,
        storedRef:
          profile.portrait_url ??
          profile.main_photo_url ??
          profile.avatar_url ??
          null,
        displaySrc: photoUrl || null,
        photoFields: {
          portrait_url: profile.portrait_url ?? null,
          avatar_url: profile.avatar_url ?? null,
          fullbody_url: profile.fullbody_url ?? null,
          main_photo_url: profile.main_photo_url ?? null,
        },
        isLoading: photoPending,
        isFailed: false,
        extra: { naturalWidth: event.currentTarget.naturalWidth },
      });
      onPhotoLoad?.(event);
    },
    [
      onPhotoLoad,
      photoPending,
      photoUrl,
      profile.avatar_url,
      profile.fullbody_url,
      profile.id,
      profile.main_photo_url,
      profile.portrait_url,
    ],
  );

  const handlePhotoError: ReactEventHandler<HTMLImageElement> = useCallback(
    (event) => {
      logPhotoTraceImgEvent(
        "onError",
        {
          screen: "Discover",
          component: "DiscoverProfileCard.tsx",
          userId: profile.id,
          slot: "primary",
          srcReceived: photoUrl || null,
        },
        event.currentTarget,
      );
      logPhotoIosDebug("img_onerror", {
        screen: "Discover",
        profileId: profile.id,
        srcKind: classifyImgSrcForIosDebug(photoUrl || event.currentTarget.currentSrc),
        imgSrcAttr: event.currentTarget.currentSrc?.slice(0, 120) ?? null,
      });
      logPhotoDebug("screen.img_onerror", {
        screen: "Discover",
        profileId: profile.id,
        storedRef:
          profile.portrait_url ??
          profile.main_photo_url ??
          profile.avatar_url ??
          null,
        displaySrc: photoUrl || null,
        photoFields: {
          portrait_url: profile.portrait_url ?? null,
          avatar_url: profile.avatar_url ?? null,
          fullbody_url: profile.fullbody_url ?? null,
          main_photo_url: profile.main_photo_url ?? null,
        },
        isLoading: photoPending,
        isFailed: true,
        error: "img_element_onerror",
        extra: { imgSrcAttr: event.currentTarget.currentSrc?.slice(0, 120) ?? null },
      });
      onPhotoError?.(event);
    },
    [
      onPhotoError,
      photoPending,
      photoUrl,
      profile.avatar_url,
      profile.fullbody_url,
      profile.id,
      profile.main_photo_url,
      profile.portrait_url,
    ],
  );

  return (
    <>
      <div
        className="relative flex h-full min-h-0 w-full flex-1 flex-col bg-app-card cursor-grab active:cursor-grabbing"
        style={{
          ...swipeZoneStyle,
          ...(playPickerActive ? { touchAction: "none" } : undefined),
        }}
        onPointerDown={guardSwipeWhenPlayPicker(onSwipeZonePointerDown)}
        onPointerMove={guardSwipeWhenPlayPicker(onSwipeZonePointerMove)}
        onPointerUp={guardSwipeWhenPlayPicker(onSwipeZonePointerUp)}
        onPointerCancel={guardSwipeWhenPlayPicker(onSwipeZonePointerCancel)}
      >
        {/* ── 1. PHOTO ── */}
        <div
          ref={photoZoneRef}
          className="relative w-full shrink-0 overflow-hidden rounded-t-[28px] bg-zinc-900 aspect-[4/3] max-h-[360px]"
        >
          {hasDisplayPhoto ? (
            <img
              src={photoUrl}
              alt={
                profile.first_name
                  ? t("discover.profileCard_photoAlt", { name: profile.first_name })
                  : t("profile_photo")
              }
              className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
              loading="eager"
              decoding="async"
              onLoad={handlePhotoLoad}
              onError={handlePhotoError}
            />
          ) : awaitingPhotoResolve ? (
            <div
              className="absolute inset-0 splove-skeleton-breathe bg-zinc-900"
              style={{ background: "linear-gradient(165deg, #18181B 0%, #2A2A2E 100%)" }}
              aria-busy
              aria-label={t("profile_photo")}
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center bg-zinc-900"
              style={{ background: "linear-gradient(165deg, #18181B 0%, #2A2A2E 100%)" }}
              aria-label={t("profile_photo")}
            >
              <span className="text-sm font-medium text-white/40">{t("profile_photo")}</span>
            </div>
          )}

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
                className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center bg-[#FF1E2D]/16"
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
              className="pointer-events-none absolute inset-0 z-[14] flex items-center justify-center bg-[#FF1E2D]/14 transition-opacity duration-75"
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
              className={`pointer-events-none absolute left-3 z-[18] rounded-full bg-[#FF1E2D]/88 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-md backdrop-blur-sm ${
                restoredProfileId === profile.id ? "top-12" : "top-3"
              }`}
            >
              {t("discover.profileCard_multiSports")}
            </div>
          ) : null}

          <div className="absolute right-3 top-3 z-[20]" data-discover-menu-root>
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
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-lg font-bold leading-none text-white backdrop-blur-sm ring-1 ring-white/25"
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

          <div className="absolute inset-x-0 bottom-2 z-30 grid grid-cols-3 items-end px-5 pointer-events-none">
            <div className="pointer-events-auto justify-self-start">
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                transition={{ type: "spring", stiffness: 520, damping: 28 }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerPass();
                }}
                className="flex h-[3.625rem] w-[3.625rem] shrink-0 items-center justify-center rounded-full border-2 border-white/35 bg-zinc-900/75 text-white shadow-lg backdrop-blur-md ring-1 ring-white/15"
                aria-label={t("pass")}
              >
                <IconPass size={24} />
              </motion.button>
            </div>

            <div className="pointer-events-auto justify-self-center">
              <motion.button
                ref={playAnchorRef}
                type="button"
                aria-label={t("splovePlay.openSheet")}
                disabled={likeSending}
                whileTap={{ scale: 0.88 }}
                transition={{ type: "spring", stiffness: 520, damping: 28 }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleFloatingPlayClick();
                }}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-[0_4px_14px_rgba(175,82,222,0.5)] ring-1 ring-white/25 disabled:opacity-60"
                style={{ background: "#AF52DE" }}
              >
                <IconHeartFilled size={18} color="#FFFFFF" />
              </motion.button>
            </div>

            <div className="pointer-events-auto justify-self-end">
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                transition={{ type: "spring", stiffness: 520, damping: 28 }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerClassicLike();
                }}
                disabled={likeSending}
                className="relative z-[20] flex h-[3.625rem] w-[3.625rem] shrink-0 items-center justify-center rounded-full shadow-[0_4px_24px_rgba(255,30,45,0.45)] ring-2 ring-white/40 disabled:opacity-60"
                style={{ background: BRAND_BG }}
                aria-label={t("like")}
              >
                <IconHeartFilled size={30} color={TEXT_ON_BRAND} />
              </motion.button>
            </div>
          </div>

          <SplovePlayHeartPicker
            open={playPickerActive}
            disabled={likeSending}
            anchorRef={playAnchorRef}
            containerRef={photoZoneRef}
            onClose={closeHeartPicker}
            onSelect={handlePlaySelect}
          />
        </div>

        {/* ── 2. INFORMATIONS ── */}
        <section className="w-full shrink-0 bg-app-card px-5 pt-4">
          <h2 className="text-[1.3rem] font-extrabold leading-tight tracking-tight text-app-text">
            {profile.first_name ?? t("unnamed_profile")}
            {age != null ? <span className="font-semibold">, {age}</span> : null}
            {heightLine ? (
              <span className="text-[0.95rem] font-semibold text-app-muted"> · {heightLine}</span>
            ) : null}
          </h2>

          {locationLine ? (
            <p className="mt-2 text-[13px] font-medium leading-snug text-app-muted">{locationLine}</p>
          ) : null}

          {descriptionLine ? (
            <p className="mt-2 text-[14px] font-medium leading-snug text-app-text">
              &ldquo;{descriptionLine}&rdquo;
            </p>
          ) : null}
        </section>

        {/* ── 3. SPORTS ── */}
        {sportChips.length > 0 ? (
          <section className="w-full shrink-0 bg-app-card px-5 pt-4">
            <div className="space-y-2.5">
              {sportChips.map(({ label: sportLabel, level }) => (
                <DiscoverSportLevelRow
                  key={sportLabel}
                  label={sportLabel}
                  slug={slugForSportLabel(profile, sportLabel)}
                  level={level}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {!immersive ? (
        <div className="border-t border-app-border/85 bg-app-card px-4 py-3.5">
          <button
            type="button"
            onClick={onReport}
            className="w-full py-1 text-center text-[11px] font-medium text-app-muted underline decoration-app-border underline-offset-2 hover:text-app-muted"
          >
            {REPORT_LINK_LABEL}
          </button>
        </div>
      ) : null}

      <SplovePlayIntroModal open={introOpen} onDismiss={dismissPlayIntro} />
    </>
  );
});

function slugForSportLabel(profile: DiscoverProfileCardModel, label: string): string | null {
  for (const ps of profile.profile_sports ?? []) {
    const sp = ps.sports;
    if (!sp) continue;
    const display = ((sp.label ?? "").trim() || (sp.slug ?? "").trim()).trim();
    if (display.toLowerCase() === label.toLowerCase()) {
      return sp.slug ?? null;
    }
  }
  return null;
}

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
