import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { PostLoginProfileSplash } from "../components/PostLoginProfileSplash";
import { isAppAuthReady } from "../lib/isAppAuthReady";
import { isColdStartSplashActive } from "../lib/coldStartSplash";
import { ReportModal } from "../components/ReportModal";
import { ReportPhotoModal } from "../components/ReportPhotoModal";
import { BLOCK_PROFILE_CONFIRM, BLOCK_PROFILE_LINK_LABEL } from "../constants/copy";

import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import {
  IconBanSoft,
  IconHeartOutline,
  IconPass,
  IconProfileAvatarPlaceholder,
} from "../components/ui/Icon";
import { BETA_MODE } from "../constants/beta";
import {
  fetchBlockExclusionDetail,
  isBlockedWith,
  type BlockExclusionDetail,
} from "../services/blocks.service";
import { fetchDiscoverFeedAlive } from "../lib/discoverFeedFetch";
import {
  discoverPipelineExclusions,
  discoverPipelineStage,
  DISCOVER_PIPELINE_AUDIT,
  DISCOVER_SCORING_FALLBACK_AFTER_COMPLETENESS,
  logProfileExcludedAudits,
} from "../lib/discoverPipelineAudit";
import { fetchConversationIdForUserPair } from "../lib/matchConversationId";
import { VerifiedBadge } from "../components/VerifiedBadge";
import { isIdentityVerified } from "../lib/profileVerification";
import {
  collectSportMatchKeysFromProfile,
  getDiscoverSportChips,
  getSharedSportLabelsForMatch,
} from "../lib/sportMatchGroups";
import { logSportMatchPreferenceScoringTrace } from "../lib/sportMatchPreference";
import {
  filterDiscoverReasonsForDisplay,
  guidedProfileSentence,
  intentLabelShort,
  softAreaHint,
} from "../lib/discoverCardCopy";
import { buildDiscoverScore, computeReliabilityScore, getReliabilityUiHints } from "../lib/discoverScore";
import { runDiscoverScoring } from "../services/discoverScoring.service";
import { getDiscoverFeedIntegrityExclusionReasons } from "../lib/onboardingDiscoverReadiness";
import { buildDiscoverLocationLines, formatViewerRadiusLabel } from "../utils/geolocation";
import { formatCityDisplay } from "../lib/formatCityDisplay";
import { hasSharedPlace } from "../lib/sharedPlaceTeaser";
import { usePremium } from "../hooks/usePremium";
import { useSplovePlus } from "../hooks/useSplovePlus";
import { useTranslation } from "../i18n/useTranslation";
import { useProfilePhotoResolvedDisplay, resolveProfilePhotoFieldFromStoredRef } from "../hooks/useProfilePhotoSignedUrl";
import {
  logProfilePhotoUiDecision,
  pickPrimaryProfilePhotoStoredRef,
  pickSecondaryProfilePhotoStoredRef,
  resolveProfilePhotoUiSrc,
} from "../lib/profilePhotoDisplayUrl";
import { DiscoverProfileCard } from "../components/discover/DiscoverProfileCard";
import { MoveProfileSkeleton } from "../components/discover/MoveProfileSkeleton";
import { EmptyDiscoverState } from "../components/discover/EmptyDiscoverState";
import { SplovePinIcon } from "../components/splovePlus/SplovePlusIcons";
import { ProfilePhotoViewerModal } from "../components/ProfilePhotoViewerModal";
import { chainPhotoRenderHandlers, PhotoRenderLog } from "../lib/photoRenderLog";
import { useDiscoverUndoNavRegistration } from "../contexts/DiscoverUndoNavContext";
import { IS_BETA_UNDO_FREE } from "../constants/discoverUndo";
import {
  consumeDiscoverUndoCredit,
  DISCOVER_UNDO_CREDIT_EVENT,
  type DiscoverUndoCreditEventDetail,
  getDiscoverUndoCreditCount,
  hasDiscoverUndoCredit,
} from "../lib/discoverUndoCredits";
import {
  applyLocalProfileViewActionTaken,
  applyLocalProfileViewWithoutAction,
  createEmptyProfileViewOrderingState,
  orderDiscoverProfilesByProfileViews,
  rotateProfileToEndOfStack,
  type DiscoverProfileViewOrderingState,
} from "../lib/discoverProfileViewOrdering";
import {
  fetchDiscoverProfileViewOrderingState,
  markProfileViewActionTaken,
  recordProfileViewWithoutAction,
} from "../services/profileViews.service";
import { SecondChancePassCard } from "../components/SecondChancePassCard";
import { SecondChanceMessageModal } from "../components/SecondChanceMessageModal";
import { createSecondChanceRequest } from "../services/secondChance.service";
import { uniqueProfilePhotoRefsOrdered } from "../lib/profilePhotoSignedUrl";
import {
  fetchProfileCrossings,
  getDiscoverRewindStatus,
  recordDiscoverSwipe,
  rewindLastDiscoverSwipe,
  type DiscoverRewindStatus,
} from "../services/discoverSwipes.service";
import {
  mergeOptionalProfileFields,
  POST_LOGIN_BOOT_MAX_MS,
} from "../lib/profileSelect";
import { mergeDiscoverViewerOptionalFields } from "../lib/profileAdaptedOpenness";
import { fetchProfileDistancesOptional } from "../lib/optionalSupabase";
import {
  buildClientDiscoverDistanceById,
  DISCOVER_BETA_SIMPLE_PIPELINE,
  filterDiscoverVisibilityWindow,
} from "../lib/discoverBetaPipeline";
import {
  logDiscoverEmptyStateVisible,
  logDiscoverFirstCardVisible,
  logDiscoverShellVisible,
  runPostLoginOptionalBatch,
} from "../lib/postLoginPerf";
import { asAgePreferenceScalar } from "../lib/profileAge";
import { practiceCompatibilityScore } from "../lib/sportPracticeCompatibilityScore";
import ReferralCard from "../components/referral/ReferralCard";
import ReferralModal from "../components/referral/ReferralModal";
import { DiscoverLocalImpactCard } from "../components/discover/DiscoverLocalImpactCard";
import { MatchIntroModal } from "../components/match/MatchIntroModal";
import { hasSeenMatchIntro, markMatchIntroSeen } from "../lib/matchIntroStorage";
import {
  matchIntroPrimaryOpensActivity,
  resolveMatchIntroVariant,
  type MatchIntroVariant,
} from "../lib/matchIntroVariant";
import {
  getOrCreateReferralCode,
  getReferralVariant,
  trackReferralEvent,
} from "../lib/referral";
import {
  applyMoveProfileRotationForFeedCommit,
  reapplyColdLaunchMoveProfileRotation,
} from "../lib/moveFirstProfileRotation";
import {
  countReferralsAsReferrer,
  countReferralsRowsByReferrer,
  fetchGrowthProfileFields,
} from "../services/referral.service";
import { trackEvent, getAbVariant, SECOND_CHANCE_COPY_TEST } from "../lib/analytics";
import {
  hasFiniteDiscoverCoordinates,
  takeDiscoverProfilesWithValidGps,
  viewerHasDiscoverSearchCoords,
} from "../constants/discoverGeo";
import { coerceProfileHeightCm, formatHeightCmForDisplay } from "../lib/profileHeightCm";
import { deferSecondaryWork } from "../lib/deferSecondaryWork";
import { usesNativeBottomNavigation, modalSheetHostClass, profileSheetClass } from "../lib/nativeBottomNav";
import { clearOauthProcessingLock, isOauthProcessingLocked } from "../lib/oauthCallbackLock";

type Profile = {
  id: string;
  first_name: string | null;
  /** May be absent on the Discover feed view depending on the view. */
  city?: string | null;
  birth_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** Canonical display URL when present; feed may omit this column. */
  main_photo_url?: string | null;
  /** Fallbacks when main_photo_url is absent (see repo migrations). */
  avatar_url?: string | null;
  portrait_url?: string | null;
  fullbody_url?: string | null;
  sport_feeling?: string | null;
  gender?: string | null;
  looking_for?: string | null;
  /** Type de rencontre (BDD : Amical | Amoureux). */
  intent?: string | null;
  /** Ouverture pratique adaptée (migration 094+) */
  open_to_adapted_activities?: string | null;
  pref_open_to_adapted_activity?: boolean | null;
  sport_match_preference?: string | null;
  sport_phrase?: string | null;
  /** Taille affichée discrètement si renseignée (cm). */
  height_cm?: number | null;
  sport_time?: string | null;
  /** Voir `profiles.is_photo_verified` (Veriff). */
  is_photo_verified?: boolean | null;
  photo_status?: string | null;
  identity_verified?: boolean | null;
  veriff_status?: string | null;
  needs_adapted_activities?: boolean | null;
  /** Rythme de pratique affiché sur Discover : solo | adapted | flexible */
  sport_practice_type?: string | null;
  profile_sports?: {
    sport_id?: string | number | null;
    sports: { id?: string | number | null; label: string | null; slug?: string | null } | null;
  }[];
  profile_completed?: boolean | null;
  last_active_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
  search_radius_km?: number | null;
  max_distance_km?: number | null;
  discovery_radius_km?: number | null;
  location_updated_at?: string | null;
  is_active_mode?: boolean | null;
  reliability_label?: string | null;
  activity_label?: string | null;
  availability_label?: string | null;
  vibe_label?: string | null;
  feed_reason?: string | null;
};

/** Resolve photo URL from whatever columns the feed view row actually includes. */
function getProfileDisplayPhotoUrl(p: Profile): string | null {
  return pickPrimaryProfilePhotoStoredRef(p);
}

/** Deuxième visuel pour l’aperçu (évite le doublon de la photo principale). */
function getSecondaryPhotoUrl(p: Profile): string | null {
  const main = getProfileDisplayPhotoUrl(p);
  const secondary = pickSecondaryProfilePhotoStoredRef(p);
  if (secondary && secondary !== main) return secondary;
  return null;
}

type ProfileWithAffinity = Profile & {
  commonSportsCount: number;
  discoverScore: number;
  practice_score: number;
  distanceKm: number | null;
  discover_reasons: string[];
  discover_excluded: boolean;
  /** Tri principal Discover — ne pas afficher. */
  reliabilityScore: number;
  is_boost_active?: boolean;
  /** Au moins un place_ref commun avec le viewer — renseigné par `discover_shared_place_flags` ; jamais de nom dans l’UI Discover. */
  has_shared_place?: boolean;
};

type DiscoverAliveRow = {
  profile: Profile | null;
  activity_label: string | null;
  availability_label: string | null;
  vibe_label: string | null;
  feed_reason: string | null;
};

/** Dernière(s) action(s) Discover locales — miroir du stack pour un rewind instantané. */
type DiscoverSwipeHistoryEntry = { profile: ProfileWithAffinity; action: "like" | "pass" };

type DiscoverProfileDetailPreviewProps = {
  profile: ProfileWithAffinity;
  mySportMatchKeys: Set<string>;
  myCity: string | null;
  discoverMenuProfileId: string | null;
  setDiscoverMenuProfileId: Dispatch<SetStateAction<string | null>>;
  onBackdropClick: () => void;
  onBlock: (id: string) => void | Promise<void>;
  onReportPhoto: (p: ProfileWithAffinity) => void;
  onPreviewLike: () => void;
  onPass: (id: string) => void;
  onClose: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

function DiscoverProfileDetailPreview({
  profile,
  mySportMatchKeys,
  myCity,
  discoverMenuProfileId,
  setDiscoverMenuProfileId,
  onBackdropClick,
  onBlock,
  onReportPhoto,
  onPreviewLike,
  onPass,
  onClose,
  t,
}: DiscoverProfileDetailPreviewProps) {
  const photoMainRaw = getProfileDisplayPhotoUrl(profile);
  const photoSecondRaw = getSecondaryPhotoUrl(profile);
  const photoMainDisplay = useProfilePhotoResolvedDisplay(photoMainRaw, {
    deferMs: DISCOVER_PHOTO_SIGN_DEFER_MS,
    discoverContext: {
      profileId: profile.id,
      photoField: resolveProfilePhotoFieldFromStoredRef(profile, photoMainRaw),
    },
  });
  const photoSecondDisplay = useProfilePhotoResolvedDisplay(photoSecondRaw, {
    deferMs: DISCOVER_PHOTO_SIGN_DEFER_MS,
    discoverContext: {
      profileId: profile.id,
      photoField: resolveProfilePhotoFieldFromStoredRef(profile, photoSecondRaw),
    },
  });
  const photoMain = resolveProfilePhotoUiSrc(photoMainRaw, photoMainDisplay.src) ?? "";
  const photoSecond = resolveProfilePhotoUiSrc(photoSecondRaw, photoSecondDisplay.src) ?? "";
  const galleryRawRefs = useMemo(
    () => uniqueProfilePhotoRefsOrdered(profile),
    [
      profile.id,
      profile.main_photo_url,
      profile.portrait_url,
      profile.avatar_url,
      profile.fullbody_url,
    ],
  );
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerInitial, setPhotoViewerInitial] = useState(0);
  const nameForViewer = profile.first_name?.trim() || null;
  const age = getAgeFromBirthDate(profile.birth_date ?? null);
  const phraseTrimPreview = (profile.sport_phrase ?? "").trim();
  const sportChipsPreview = getDiscoverSportChips(profile, mySportMatchKeys);
  const intentPreview = intentLabelShort(profile.intent);
  const heightPreview = formatHeightCmForDisplay(profile.height_cm ?? null);
  function openPhotoViewerFromRaw(raw: string | null) {
    if (raw == null) return;
    const i = galleryRawRefs.indexOf(raw);
    setPhotoViewerInitial(i >= 0 ? i : 0);
    setPhotoViewerOpen(true);
  }
  return (
    <>
    <div
      className={`fixed inset-0 z-[60] flex items-end justify-center bg-black/45 px-4 pt-4 sm:items-center ${modalSheetHostClass()}`}
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="discover-preview-title"
        className={`flex w-full max-w-md flex-col overflow-hidden rounded-3xl bg-app-card shadow-xl ${profileSheetClass()}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid h-44 shrink-0 grid-cols-2 gap-0.5 bg-app-border sm:h-52">
          <div className="relative min-h-0 bg-app-border">
            {photoMain ? (
              <img
                src={photoMain}
                alt={profile.first_name ? `Photo de ${profile.first_name}` : "Photo du profil"}
                className="absolute inset-0 h-full w-full cursor-pointer object-cover"
                onError={photoMainDisplay.onImageError}
                onClick={(e) => {
                  e.stopPropagation();
                  openPhotoViewerFromRaw(photoMainRaw);
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                <img src="/logo.png" alt="" aria-hidden className="h-10 w-10 object-contain opacity-70" />
              </div>
            )}
            <div className="absolute right-1.5 top-1.5 z-20" data-discover-menu-root>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={discoverMenuProfileId === profile.id}
                aria-label={t("more_actions")}
                onClick={() =>
                  setDiscoverMenuProfileId((id) => (id === profile.id ? null : profile.id))
                }
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-base font-bold leading-none text-white backdrop-blur-sm hover:bg-black/45"
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
                    onClick={() => void onBlock(profile.id)}
                  >
                    <IconBanSoft size={18} className="shrink-0 text-app-muted" />
                    {BLOCK_PROFILE_LINK_LABEL}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-app-text hover:bg-app-border"
                    onClick={() => {
                      setDiscoverMenuProfileId(null);
                      onReportPhoto(profile);
                    }}
                  >
                    {t("report_photo")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="relative min-h-0 bg-app-border/80">
            {photoSecond ? (
              <img
                src={photoSecond}
                alt=""
                className="absolute inset-0 h-full w-full cursor-pointer object-cover"
                onError={photoSecondDisplay.onImageError}
                onClick={(e) => {
                  e.stopPropagation();
                  openPhotoViewerFromRaw(photoSecondRaw);
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-app-border/90">
                <span className="text-[11px] font-medium text-app-muted">—</span>
              </div>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 sm:px-5 [-webkit-overflow-scrolling:touch]">
          <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="discover-preview-title" className="text-lg font-bold leading-tight text-app-text">
              {profile.first_name ?? t("unnamed_profile")}
              {age != null ? <span className="font-semibold text-app-muted">, {age}</span> : null}
              {heightPreview ? (
                <span className="ml-1 text-sm font-medium text-app-muted">· {heightPreview}</span>
              ) : null}
            </h2>
            {intentPreview ? (
              <span className="rounded-full bg-app-border/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-app-text ring-1 ring-app-border">
                {intentPreview}
              </span>
            ) : null}
            {hasSharedPlace(profile) ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-app-card px-2 py-0.5 text-[10px] font-semibold tracking-wide text-app-text ring-1 ring-amber-200/60">
                <span aria-hidden className="inline-flex text-amber-200">
                  <SplovePinIcon size={11} />
                </span>
                <span>Lieu commun</span>
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {profile.is_active_mode === true ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-200/90">
                {t("discover.badgeReadyToMeet")}
              </span>
            ) : null}
            <span className="rounded-full bg-app-border/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-app-text ring-1 ring-app-border">
              {t("discover.badge48h")}
            </span>
            {isIdentityVerified(profile) ? <VerifiedBadge variant="compact" /> : null}
          </div>
          {sportChipsPreview.length > 0 ? (
            <div className="flex max-h-[5rem] flex-wrap gap-1.5 overflow-hidden">
              {sportChipsPreview.map(({ label: sportLabel, shared }) => (
                <span
                  key={sportLabel}
                  className={
                    shared
                      ? "rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200/90"
                      : "rounded-full bg-app-border/60 px-2.5 py-1 text-[11px] font-semibold text-app-text ring-1 ring-app-border"
                  }
                >
                  {sportLabel}
                </span>
              ))}
            </div>
          ) : null}
          {(() => {
            const fc = firstCommonSportName(profile, mySportMatchKeys);
            const guidedPv = guidedProfileSentence({
              sport_phrase: phraseTrimPreview ? null : profile.sport_phrase,
              sport_feeling: profile.sport_feeling,
              firstCommonSport: fc,
              commonSportLineSuffix: t("discover.real_outing_intent"),
            });
            const locPv = buildDiscoverLocationLines({
              distanceKm: profile.distanceKm,
              viewerCity: myCity,
              profileCity: profile.city ?? null,
              labels: {
                zoneHintPrefix: t("discover.zone_hint"),
                sameSector: t("discover.same_sector"),
              },
            });
            const reasonsPv = filterDiscoverReasonsForDisplay(
              profile.discover_reasons ?? [],
              locPv.line1,
            );
            const ahPv = softAreaHint(myCity, profile.city, {
              nearby: t("discover.nearby_area_hint"),
              twoSectors: t("discover.two_sectors_hint"),
            });
            const hintPv = getReliabilityUiHints(profile);
            return (
              <div className="space-y-2 border-t border-app-border/80 pt-2.5">
                {reasonsPv.length > 0 ? (
                  <p className="text-[11px] font-semibold leading-snug text-app-muted">
                    {reasonsPv.join(" · ")}
                  </p>
                ) : null}
                {phraseTrimPreview ? (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-app-muted">{t("discover.momentWish")}</p>
                    <p className="mt-0.5 line-clamp-3 text-[13px] font-medium leading-snug text-app-text">{phraseTrimPreview}</p>
                  </div>
                ) : null}
                <p className="line-clamp-3 text-[13px] font-medium leading-snug text-app-text">{guidedPv}</p>
                {locPv.line1 ? (
                  <p className="text-[12px] font-medium leading-snug text-app-text">{locPv.line1}</p>
                ) : null}
                {locPv.line2 ? (
                  <p className="text-[12px] leading-snug text-app-muted">{locPv.line2}</p>
                ) : null}
                {!locPv.line1 && !locPv.line2 && ahPv ? (
                  <p className="text-[12px] leading-snug text-app-muted">{ahPv}</p>
                ) : null}
                {hintPv.length > 0 ? (
                  <ul className="space-y-0.5 text-[11px] font-medium leading-snug text-emerald-800/90">
                    {hintPv.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })()}
          </div>
        </div>
        <div className="shrink-0 space-y-2 border-t border-app-border/80 bg-app-card px-4 pb-4 pt-3 sm:px-5">
          <button
            type="button"
            className="w-full rounded-2xl py-4 text-base font-bold shadow-lg transition hover:opacity-95 sm:text-[17px]"
            style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
            onClick={() => void onPreviewLike()}
          >
            {t("propose_activity")}
          </button>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="rounded-full px-2 py-1.5 text-xs font-medium text-app-muted hover:bg-app-border hover:text-app-muted"
              onClick={onClose}
            >
              {t("close")}
            </button>
            <button
              type="button"
              className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium text-app-muted hover:bg-app-border hover:text-app-muted"
              onClick={() => {
                onPass(profile.id);
              }}
            >
              <IconPass size={16} />
              {t("pass")}
            </button>
            <button
              type="button"
              className="group flex items-center gap-1 rounded-full border border-app-border bg-app-card px-2.5 py-1.5 text-xs font-semibold text-app-text shadow-sm hover:bg-app-border"
              onClick={() => void onPreviewLike()}
            >
              <IconHeartOutline
                size={16}
                color="#FF1E2D"
                className="transition-opacity group-active:opacity-60"
              />
              {t("like")}
            </button>
          </div>
        </div>
      </div>
    </div>
    <ProfilePhotoViewerModal
      isOpen={photoViewerOpen}
      onClose={() => setPhotoViewerOpen(false)}
      rawRefs={galleryRawRefs}
      initialIndex={photoViewerInitial}
      nameForAlt={nameForViewer}
      profilePhotoFields={profile}
    />
    </>
  );
}

function boostStorageKeys(profileId: string) {
  return {
    active: `splove_${profileId}_boost_active`,
    start: `splove_${profileId}_boost_start_time`,
    duration: `splove_${profileId}_boost_duration`,
  };
}

function clearProfileBoostStorage(profileId: string) {
  const k = boostStorageKeys(profileId);
  try {
    localStorage.removeItem(k.active);
    localStorage.removeItem(k.start);
    localStorage.removeItem(k.duration);
  } catch {
    // ignore storage cleanup errors
  }
}

function isProfileBoostActive(profileId: string): boolean {
  if (!profileId) return false;
  const k = boostStorageKeys(profileId);
  try {
    const active = localStorage.getItem(k.active);
    const startRaw = localStorage.getItem(k.start);
    const durationRaw = localStorage.getItem(k.duration);
    if (active !== "true" || !startRaw || !durationRaw) return false;
    const start = Number(startRaw);
    const durationMinutes = durationRaw === "60" ? 60 : durationRaw === "30" ? 30 : 0;
    if (!Number.isFinite(start) || durationMinutes <= 0) {
      clearProfileBoostStorage(profileId);
      return false;
    }
    const expiresAt = start + durationMinutes * 60 * 1000;
    if (Date.now() >= expiresAt) {
      clearProfileBoostStorage(profileId);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function ghostStorageKeys(profileId: string) {
  return {
    active: `splove_${profileId}_ghost_mode`,
    start: `splove_${profileId}_ghost_start_time`,
    duration: `splove_${profileId}_ghost_duration`,
  };
}

function clearProfileGhostStorage(profileId: string) {
  const k = ghostStorageKeys(profileId);
  try {
    localStorage.removeItem(k.active);
    localStorage.removeItem(k.start);
    localStorage.removeItem(k.duration);
  } catch {
    // ignore storage cleanup errors
  }
}

function isProfileGhostActive(profileId: string): boolean {
  if (!profileId) return false;
  const k = ghostStorageKeys(profileId);
  try {
    const active = localStorage.getItem(k.active);
    if (active !== "true") return false;
    const startRaw = localStorage.getItem(k.start);
    const durationRaw = localStorage.getItem(k.duration);
    if (!startRaw || !durationRaw) {
      clearProfileGhostStorage(profileId);
      return false;
    }
    const start = Number(startRaw);
    const durationHours = Number(durationRaw);
    if (!Number.isFinite(start) || !Number.isFinite(durationHours) || durationHours <= 0) {
      clearProfileGhostStorage(profileId);
      return false;
    }
    const expiresAt = start + durationHours * 60 * 60 * 1000;
    if (Date.now() >= expiresAt) {
      clearProfileGhostStorage(profileId);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** TRI Discover V3 + mode actif SPLove+ (tie-break). */
function sortDiscoverProfileStack(a: ProfileWithAffinity, b: ProfileWithAffinity, hasPlus: boolean): number {
  if (hasPlus) {
    const aActive = a.is_active_mode === true ? 1 : 0;
    const bActive = b.is_active_mode === true ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
  }
  const bd = Number(b.discoverScore) || 0;
  const ad = Number(a.discoverScore) || 0;
  if (bd !== ad) return bd - ad;
  const bp = Number(b.practice_score) || 0;
  const ap = Number(a.practice_score) || 0;
  if (bp !== ap) return bp - ap;
  const bLab = safeTimeMs(b.last_active_at);
  const aLab = safeTimeMs(a.last_active_at);
  if (bLab !== aLab) return bLab - aLab;
  return safeTimeMs(b.created_at) - safeTimeMs(a.created_at);
}

type LikeRpcParsed = { is_match: boolean; conversation_id: string | null };

function parseLikeRpcResult(data: unknown): LikeRpcParsed | null {
  if (data == null) return null;
  const o = Array.isArray(data) ? data[0] : data;
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const im = r.is_match ?? r.isMatch;
  const mid = r.match_id ?? r.matchId;
  const hasMatchRow = typeof mid === "string" && mid.length > 0;
  const is_match =
    im === true ||
    im === "t" ||
    (typeof im === "string" && im.toLowerCase() === "true") ||
    hasMatchRow;
  const raw = r.conversation_id ?? r.conversationId;
  const conversation_id =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
  return { is_match, conversation_id };
}

function getSharedSportsFromProfile(myMatchKeys: Set<string>, profile: Profile): string[] {
  return getSharedSportLabelsForMatch(myMatchKeys, profile);
}

function commonSportsCount(myMatchKeys: Set<string>, profile: Profile): number {
  return getSharedSportsFromProfile(myMatchKeys, profile).length;
}

function getAgeFromBirthDate(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  if (age < 18 || age > 120) return null;
  return age;
}

function firstCommonSportName(profile: Profile, myMatchKeys: Set<string>): string | null {
  const shared = getSharedSportsFromProfile(myMatchKeys, profile);
  return shared[0] ?? null;
}

/** Tri Discover : évite NaN sur dates ISO imparfaites. */
function safeTimeMs(iso: string | null | undefined): number {
  if (typeof iso !== "string" || !iso.trim()) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Dev-only: Bruno / Sofiane (same pattern as discoverScoring.service). */
const DISCOVER_DIAG_NAME_RE = /\b(bruno|sofiane)\b/i;

function discoverDiagHighlightName(firstName: string | null | undefined): boolean {
  return typeof firstName === "string" && DISCOVER_DIAG_NAME_RE.test(firstName.trim());
}

function discoverBetaPhotoRejectReason(p: Profile): string {
  const st = String(p.photo_status ?? "").trim().toLowerCase();
  if (st === "rejected") return "rejected photo";
  if (st === "pending" || st === "review") return "pending photo";
  return "missing required field";
}

function discoverDevPipelineDiff(
  prev: Profile[],
  next: Profile[],
  step: string,
  reasonFor: (p: Profile) => string,
  pipelineDetail?: string,
): void {
  discoverPipelineExclusions(step, prev, next, reasonFor, pipelineDetail);
  if (!import.meta.env.DEV) return;
  const nextIds = new Set(next.map((x) => x.id).filter((id): id is string => Boolean(id)));
  for (const p of prev) {
    const id = p?.id;
    if (id && nextIds.has(id)) continue;
    const exclusion_reason = reasonFor(p);
    const hl = discoverDiagHighlightName(p.first_name);
    const row: Record<string, unknown> = {
      step,
      first_name: p.first_name ?? null,
      id: id ?? null,
      exclusion_reason,
      ...(pipelineDetail ? { pipeline_detail: pipelineDetail } : {}),
    };
    if (hl) row.diag_highlight_name = true;
    if (hl) console.info("[Discover diagnostics] pipeline excluded (Bruno/Sofiane)", row);
    else console.info("[Discover diagnostics] pipeline excluded", row);
  }
}


function discoverRelationshipToken(raw: string | null | undefined): string {
  const t = (raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9_, -]+/g, "");
  if (t === "men") return "male";
  if (t === "women") return "female";
  return t;
}

function discoverCanonicalGender(raw: string | null | undefined): string | null {
  const t = discoverRelationshipToken(raw);
  if (!t) return null;
  if (["femme", "femmes", "female", "woman", "women"].includes(t)) return "female";
  if (["homme", "hommes", "male", "man", "men"].includes(t)) return "male";
  if (["femme trans", "trans_female", "trans woman", "trans women", "trans_women"].includes(t))
    return "trans_female";
  if (["homme trans", "trans_male", "trans man", "trans men", "trans_men"].includes(t))
    return "trans_male";
  if (["non-binaire", "non binaire", "non_binary", "nonbinary", "non-binary"].includes(t))
    return "non_binary";
  return null;
}

function discoverParseLookingFor(raw: string | null | undefined): Set<string> {
  const out = new Set<string>();
  const source = discoverRelationshipToken(raw)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  for (const t of source) {
    if (["tous", "all", "everyone"].includes(t)) {
      out.clear();
      out.add("all");
      return out;
    }
    if (["femme", "femmes", "women", "female"].includes(t)) out.add("female");
    else if (["homme", "hommes", "men", "male"].includes(t)) out.add("male");
    else if (["femmes trans", "femme trans", "trans_women", "trans women"].includes(t))
      out.add("trans_female");
    else if (["hommes trans", "homme trans", "trans_men", "trans men"].includes(t))
      out.add("trans_male");
    else if (["non-binaires", "non-binaire", "non_binary", "nonbinary"].includes(t))
      out.add("non_binary");
  }
  return out;
}

function discoverLookingForAcceptsGender(lookingFor: Set<string>, gender: string | null): boolean {
  if (!gender) return false;
  if (lookingFor.has("all")) return true;
  return lookingFor.has(gender);
}

function discoverExtractProfileSportIds(profile: Pick<Profile, "profile_sports"> | null | undefined): string[] {
  const out = new Set<string>();
  const list = profile?.profile_sports;
  if (!Array.isArray(list)) return [];
  for (const row of list) {
    const direct = row?.sport_id;
    if (typeof direct === "string" || typeof direct === "number") out.add(String(direct));
    const nested = row?.sports?.id;
    if (typeof nested === "string" || typeof nested === "number") out.add(String(nested));
  }
  return [...out];
}

function discoverLogStageCount(stage: string, count: number, extra?: Record<string, unknown>): void {
  if (DISCOVER_PIPELINE_AUDIT) {
    console.log("[Discover pipeline] count", { stage, count, ...(extra ?? {}) });
  }
  if (!import.meta.env.DEV) return;
  console.info("[Discover diagnostics] stage_count", {
    stage,
    count,
    ...(extra ?? {}),
  });
}

const DISCOVER_DISPLAY_LIMIT = 10;
/** Signatures storage Discover : après le premier paint (skeleton / carte sans photo bloquante). */
const DISCOVER_PHOTO_SIGN_DEFER_MS = 400;
/** Sonde navigation externe (profil hors pile) — pas le flux principal Discover. */
const DISCOVER_FEED_SOURCE = "feed_profiles_ranked" as const;

/** Message utilisateur sûr (aucun détail technique backend). */
function discoverFetchFailedMsg(language: "fr" | "en"): string {
  return language === "en"
    ? "Unable to load profiles. Check your connection and try again."
    : "Impossible de charger les profils. Verifie ta connexion et reessaie.";
}

const DiscoverStackSilhouette = memo(function DiscoverStackSilhouette({
  profile,
  layer,
}: {
  profile: ProfileWithAffinity;
  layer: "mid" | "back";
}) {
  const photoRaw = getProfileDisplayPhotoUrl(profile);
  const photoDisplay = useProfilePhotoResolvedDisplay(photoRaw, {
    deferMs: DISCOVER_PHOTO_SIGN_DEFER_MS,
    discoverContext: {
      profileId: profile.id,
      photoField: resolveProfilePhotoFieldFromStoredRef(profile, photoRaw),
    },
  });
  const photoUrl = resolveProfilePhotoUiSrc(photoRaw, photoDisplay.src) ?? "";
  const isBack = layer === "back";
  if (!hasFiniteDiscoverCoordinates(profile)) {
    if (import.meta.env.DEV) {
      console.warn("[Discover GPS] DiscoverStackSilhouette_guard", {
        candidate_profile_id: profile.id,
        latitude: profile.latitude ?? null,
        longitude: profile.longitude ?? null,
        excluded_reason: "missing_or_invalid_candidate_gps",
      });
    }
    return null;
  }
  return (
    <div
      className="pointer-events-none absolute inset-x-[7px] overflow-visible sm:inset-x-2.5"
      style={{
        top: isBack ? 26 : 12,
        bottom: "4.5rem",
        zIndex: isBack ? 6 : 14,
        transform: isBack ? "scale(0.914) translateY(16px)" : "scale(0.958) translateY(7px)",
        transition: "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s ease",
        opacity: isBack ? 0.82 : 0.9,
      }}
      aria-hidden
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[26px] bg-zinc-950 shadow-[0_24px_55px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.06]">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-full w-full object-cover" onError={photoDisplay.onImageError} />
          ) : (
            <div className="flex h-full min-h-[240px] items-center justify-center bg-zinc-900">
              <IconProfileAvatarPlaceholder className="text-app-muted/45" size={56} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/35 to-black/45" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(255,30,45,0.07),transparent_55%)]" />
        </div>
      </div>
    </div>
  );
});

const SWIPE_COMMIT_PX = 72;
const TAP_MAX_PX = 15;
const SWIPE_DAMP = 0.55;
/** Colonnes stables sur `profiles` — pas de champs optionnels / premium (voir mergeOptionalProfileFields). */
const DISCOVER_PROFILES_DETAIL_SELECT =
  "id, first_name, birth_date, created_at, updated_at, last_active_at, gender, looking_for, intent, sport_feeling, sport_phrase, height_cm, portrait_url, fullbody_url, avatar_url, main_photo_url, city, latitude, longitude, profile_completed, is_photo_verified, photo_status, is_active_mode, sport_practice_type, profile_sports(sport_id, sports(id, label, slug))";

/** Profil viewer Discover : colonnes plates stables (sports via `profile_sports`, optionnels via merge). */
const DISCOVER_VIEWER_ME_SELECT =
  "id, first_name, city, latitude, longitude, discovery_radius_km, birth_date, gender, looking_for, intent, profile_completed, onboarding_completed, onboarding_done, onboarding_sports_count, photo_status, portrait_url, fullbody_url, main_photo_url, sport_match_preference";

const DISCOVER_CANDIDATE_HYDRATE_SELECT =
  "id, birth_date, gender, looking_for, intent, height_cm, sport_match_preference, profile_sports(sport_id, sports(id, slug, label))";

/** Auth gate profile omet souvent les colonnes optionnelles — relecture ciblée si absent. */
async function ensureViewerSportMatchPreferenceLoaded(
  profile: Profile,
  viewerId: string,
): Promise<Profile> {
  const existing = profile.sport_match_preference;
  if (typeof existing === "string" && existing.trim().length > 0) return profile;
  const { data, error } = await supabase
    .from("profiles")
    .select("sport_match_preference")
    .eq("id", viewerId)
    .maybeSingle();
  if (error || !data) return profile;
  const raw = (data as { sport_match_preference?: unknown }).sport_match_preference;
  if (typeof raw !== "string" || !raw.trim()) return profile;
  return { ...profile, sport_match_preference: raw.trim() };
}

/** Reconstruit une carte Discover après rewind (hors re-score filtre feed). */
async function buildAffinityProfileForRewind(input: {
  currentUserId: string;
  targetId: string;
  meProfile: Profile;
  mySportMatchKeys: Set<string>;
}): Promise<ProfileWithAffinity | null> {
  const { data: p, error } = await supabase
    .from("profiles")
    .select(DISCOVER_PROFILES_DETAIL_SELECT)
    .eq("id", input.targetId)
    .maybeSingle();
  if (error || !p) return null;
  const pRow = p as unknown as Profile;
  const distById = DISCOVER_BETA_SIMPLE_PIPELINE
    ? buildClientDiscoverDistanceById(input.meProfile, [
        { id: input.targetId, latitude: pRow.latitude, longitude: pRow.longitude },
      ])
    : await fetchProfileDistancesOptional([input.targetId]);
  const distanceKm = distById.get(input.targetId) ?? null;
  const discover = buildDiscoverScore(pRow, {
    mySportMatchKeys: input.mySportMatchKeys,
    myProfile: input.meProfile,
    distanceKmOverride: distanceKm ?? undefined,
  });
  let common = 0;
  try {
    common = commonSportsCount(input.mySportMatchKeys, pRow);
  } catch {
    /* ignore */
  }
  let enriched: ProfileWithAffinity = {
    ...pRow,
    commonSportsCount: discover.sharedSportsCount || (Number.isFinite(common) ? common : 0),
    discoverScore: discover.score,
    practice_score: practiceCompatibilityScore(
      input.meProfile.sport_practice_type,
      pRow.sport_practice_type,
    ),
    distanceKm: discover.distanceKm,
    discover_reasons: discover.reasons,
    discover_excluded: discover.excluded,
    reliabilityScore: computeReliabilityScore(pRow),
  };
  const { data: sharedRows } = await supabase.rpc("discover_shared_place_flags", {
    p_viewer_id: input.currentUserId,
    p_candidate_ids: [input.targetId],
  });
  const has_shared_place = (sharedRows ?? []).some(
    (r: { profile_id?: string; has_shared_place?: boolean }) =>
      r.profile_id === input.targetId && r.has_shared_place === true,
  );
  enriched = { ...enriched, has_shared_place };
  enriched = { ...enriched, is_boost_active: isProfileBoostActive(input.targetId) };
  return enriched;
}

/** IDs déjà likés — schéma `likes` : `liker_id` / `liked_id` uniquement. */
async function fetchOutgoingLikedUserIds(userId: string): Promise<Set<string>> {
  const out = new Set<string>();
  const { data, error } = await supabase
    .from("likes")
    .select("liked_id")
    .eq("liker_id", userId);

  if (error) {
    console.warn("[Discover feed] likes (liker_id / liked_id):", error.message);
    return out;
  }
  for (const row of data ?? []) {
    const id = (row as { liked_id?: string | null }).liked_id;
    if (typeof id === "string" && id.length > 0) out.add(id);
  }
  return out;
}

async function fetchMatchedUserIds(userId: string): Promise<Set<string>> {
  const out = new Set<string>();
  const { data, error } = await supabase
    .from("matches")
    .select("user_a, user_b")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);
  if (error) {
    console.warn("[Discover feed] matches exclusion:", error.message);
    return out;
  }
  for (const row of (data ?? []) as { user_a?: string | null; user_b?: string | null }[]) {
    const other = row.user_a === userId ? row.user_b : row.user_b === userId ? row.user_a : null;
    if (other && other !== userId) out.add(other);
  }
  return out;
}
/** `public.profiles.id` PK shape — drops malformed ids before like RPC / FK on likes.liked_id. */
const PROFILE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidProfileId(id: string | null | undefined): id is string {
  return typeof id === "string" && PROFILE_ID_RE.test(id);
}

function isLastSwipeRewindable(last_action: string | null | undefined): boolean {
  const a = String(last_action ?? "").toLowerCase();
  return a === "pass" || a === "like";
}

function isFeedQueryColumnError(err: { message?: string; details?: string; code?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "PGRST204" || err.code === "42703") return true;
  const m = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("could not find") ||
    m.includes("does not exist") ||
    m.includes("unknown column")
  );
}

type DiscoverSwipeCardProps = {
  profile: ProfileWithAffinity;
  /** Ville du viewer (indication floue uniquement). */
  viewerCity: string | null;
  /** Clés de matching (groupes + sports uniques), pas les libellés bruts. */
  mySportMatchKeys: Set<string>;
  discoverMenuProfileId: string | null;
  setDiscoverMenuProfileId: Dispatch<SetStateAction<string | null>>;
  onPass: (id: string, decisionTimeMs?: number) => void;
  onLike: (p: ProfileWithAffinity, decisionTimeMs?: number) => void;
  onOpenDetail: (p: ProfileWithAffinity) => void;
  onReport: (id: string) => void;
  onReportPhoto: (p: ProfileWithAffinity) => void;
  onBlock: (id: string) => void | Promise<void>;
  restoredProfileId: string | null;
  /** Pile Discover — carte plein écran, focus émotionnel. */
  immersive?: boolean;
};

const DiscoverSwipeCard = memo(function DiscoverSwipeCard({
  profile,
  viewerCity,
  mySportMatchKeys,
  discoverMenuProfileId,
  setDiscoverMenuProfileId,
  onPass,
  onLike,
  onOpenDetail,
  onReport,
  onReportPhoto,
  onBlock,
  restoredProfileId,
  immersive = false,
}: DiscoverSwipeCardProps) {
  const photoRaw = getProfileDisplayPhotoUrl(profile);
  const photoField = resolveProfilePhotoFieldFromStoredRef(profile, photoRaw);
  const photoDisplay = useProfilePhotoResolvedDisplay(photoRaw, {
    deferMs: DISCOVER_PHOTO_SIGN_DEFER_MS,
    discoverContext: { profileId: profile.id, photoField },
  });
  const photo = resolveProfilePhotoUiSrc(photoRaw, photoDisplay.src) ?? "";
  const strongAffinity = profile.commonSportsCount >= 2;
  const nativeBottomNav = usesNativeBottomNavigation();

  useEffect(() => {
    if (!photoRaw) return;
    logProfilePhotoUiDecision("discover.swipe_card", profile, photo || null, "primary");
    PhotoRenderLog.displaySrc({
      screen: "Move",
      displaySrc: photo,
      resolvedUrl: photoDisplay.src,
      profile,
      extra: { profileId: profile.id, slot: "primary" },
    });
    PhotoRenderLog.resolvedUrl({
      screen: "Move",
      displaySrc: photo,
      resolvedUrl: photoDisplay.src,
      profile,
      extra: { profileId: profile.id, slot: "primary", photoField, photoRaw },
    });
  }, [profile, photoRaw, photo, photoDisplay.src, photoField]);

  const movePhotoImgHandlers = chainPhotoRenderHandlers(
    {
      screen: "Move",
      displaySrc: photo,
      resolvedUrl: photoDisplay.src,
      profile,
      extra: { profileId: profile.id, slot: "primary", photoField, photoRaw },
    },
    { onError: photoDisplay.onImageError },
  );

  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const swipeT0Ref = useRef<number | null>(null);

  function onSwipeZonePointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    swipeT0Ref.current = typeof performance !== "undefined" ? performance.now() : Date.now();
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onSwipeZonePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (startRef.current == null) return;
    const rdx = e.clientX - startRef.current.x;
    const rdy = e.clientY - startRef.current.y;
    if (Math.abs(rdx) > Math.abs(rdy) && Math.abs(rdx) > 6) {
      e.preventDefault();
    }
    setDx(rdx * SWIPE_DAMP);
  }

  function onSwipeZonePointerUp(e: PointerEvent<HTMLDivElement>) {
    if (startRef.current == null) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const totalDx = e.clientX - startRef.current.x;
    const totalDy = e.clientY - startRef.current.y;
    startRef.current = null;
    setDragging(false);

    const absX = Math.abs(totalDx);
    const absY = Math.abs(totalDy);

    if (absX < SWIPE_COMMIT_PX && absX <= TAP_MAX_PX && absY <= TAP_MAX_PX) {
      setDx(0);
      swipeT0Ref.current = null;
      onOpenDetail(profile);
      return;
    }

    const decMs = (() => {
      const t0 = swipeT0Ref.current;
      swipeT0Ref.current = null;
      if (t0 == null) return 0;
      return Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
      );
    })();

    if (totalDx <= -SWIPE_COMMIT_PX) {
      setDx(-Math.min(420, window.innerWidth));
      window.setTimeout(() => {
        setDx(0);
        onPass(profile.id, decMs);
      }, 190);
      return;
    }
    if (totalDx >= SWIPE_COMMIT_PX) {
      setDx(Math.min(420, window.innerWidth));
      window.setTimeout(() => {
        setDx(0);
        void onLike(profile, decMs);
      }, 190);
      return;
    }

    setDx(0);
  }

  function onSwipeZonePointerCancel(e: PointerEvent<HTMLDivElement>) {
    startRef.current = null;
    swipeT0Ref.current = null;
    setDragging(false);
    setDx(0);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  if (!hasFiniteDiscoverCoordinates(profile)) {
    if (import.meta.env.DEV) {
      console.warn("[Discover GPS] DiscoverSwipeCard_guard", {
        candidate_profile_id: profile.id,
        first_name: profile.first_name ?? null,
        latitude: profile.latitude ?? null,
        longitude: profile.longitude ?? null,
        excluded_reason: "missing_or_invalid_candidate_gps",
      });
    }
    return null;
  }

  const rot = Math.max(-4, Math.min(4, dx / 95));
  const liftOpacity = 1 - Math.min(Math.abs(dx) / 320, 0.1);

  const articleShell = immersive
    ? `splove-content-reveal splove-card-premium relative z-[24] flex w-full flex-1 flex-col overflow-hidden rounded-[28px] bg-app-card shadow-[0_28px_60px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.09] ${
        strongAffinity ? "ring-2 ring-[#FF1E2D]/38" : ""
      } ${
        profile.is_boost_active
          ? "ring-2 ring-fuchsia-400/45 shadow-[0_0_28px_rgba(217,70,239,0.25)] animate-[pulse_2.8s_ease-in-out_infinite]"
          : ""
      } ${
        nativeBottomNav
          ? "min-h-0 max-h-[calc(100dvh-11.5rem)]"
          : "min-h-[min(76dvh,calc(100dvh-10rem))] max-h-[calc(100dvh-5.25rem)]"
      }`
    : `splove-content-reveal splove-card-premium mb-8 flex max-h-[min(94vh,880px)] min-h-[min(580px,90svh)] flex-col overflow-hidden rounded-[26px] bg-app-card ring-1 ring-white/[0.07] ${
        strongAffinity ? "ring-2 ring-[#FF1E2D]/35" : ""
      } ${
        profile.is_boost_active
          ? "ring-2 ring-fuchsia-400/45 shadow-[0_0_22px_rgba(217,70,239,0.22)] animate-[pulse_2.8s_ease-in-out_infinite]"
          : ""
      }`;

  return (
    <article className={articleShell}>
      <DiscoverProfileCard
        profile={profile}
        viewerCity={viewerCity}
        mySportMatchKeys={mySportMatchKeys}
        photoUrl={photo}
        discoverMenuProfileId={discoverMenuProfileId}
        setDiscoverMenuProfileId={setDiscoverMenuProfileId}
        restoredProfileId={restoredProfileId}
        dx={dx}
        swipeZoneStyle={{
          transform: `translateX(${dx}px) rotate(${rot}deg)`,
          transition: dragging ? "none" : "transform 0.2s ease-out, opacity 0.2s ease-out",
          opacity: liftOpacity,
        }}
        onSwipeZonePointerDown={onSwipeZonePointerDown}
        onSwipeZonePointerMove={onSwipeZonePointerMove}
        onSwipeZonePointerUp={onSwipeZonePointerUp}
        onSwipeZonePointerCancel={onSwipeZonePointerCancel}
        onOpenDetail={() => onOpenDetail(profile)}
        onBlock={onBlock}
        onReportPhoto={() => onReportPhoto(profile)}
        onPass={(decisionTimeMs) => onPass(profile.id, decisionTimeMs)}
        onLike={(decisionTimeMs) => void onLike(profile, decisionTimeMs)}
        onReport={() => onReport(profile.id)}
        onPhotoError={movePhotoImgHandlers.onError}
        onPhotoLoad={movePhotoImgHandlers.onLoad}
        immersive={immersive}
      />
    </article>
  );
});

export default function Discover() {
  const { t, language } = useTranslation();
  const mapSecondChanceCreateErr = (code: string) => {
    if (code === "invalid_message") return t("second_chance_err_invalid");
    if (code === "no_credit") return t("second_chance_err_credit");
    if (code === "pass_swipe_required") return t("second_chance_err_pass_required");
    if (code === "already_pending" || code === "already_used" || code === "already_exists")
      return t("second_chance_err_already");
    if (code === "already_matched") return t("second_chance_err_matched");
    if (code === "blocked") return t("second_chance_err_blocked");
    if (code === "not_authenticated") return t("error");
    return t("second_chance_err_rpc");
  };
  const navigate = useNavigate();
  const location = useLocation();
  const nativeBottomNav = usesNativeBottomNavigation();
  const isMoveRoute =
    location.pathname === "/move" ||
    location.pathname === "/discover" ||
    location.pathname === "/";
  const setDiscoverUndoNav = useDiscoverUndoNavRegistration();
  const handledPreviewNavKeyRef = useRef<string | null>(null);
  const loadProfilesInFlightRef = useRef(false);
  const loadProfilesPendingReloadRef = useRef(false);
  const reapplyRotationOnNextCommitRef = useRef(false);
  const {
    user,
    session,
    isLoading: authLoading,
    isAuthInitialized,
    profile,
    isProfileLoading,
    refetchProfile,
  } = useAuth();
  const viewerMeetActive =
    Boolean(profile) &&
    (profile as { is_active_mode?: boolean | null }).is_active_mode === true;
  /** Recharge Discover après changement des préférences d’âge (profil auth `refetchProfile`). */
  const discoverPreferredAgeFingerprint = useMemo(() => {
    if (!profile || typeof profile !== "object") return "ø:ø";
    const pr = profile as { preferred_age_min?: unknown; preferred_age_max?: unknown };
    return `${pr.preferred_age_min ?? "ø"}:${pr.preferred_age_max ?? "ø"}`;
  }, [profile]);
  const currentUserId = user?.id ?? session?.user?.id ?? "";
  const { hasPlus } = usePremium(currentUserId || null);
  const [profiles, setProfiles] = useState<ProfileWithAffinity[]>([]);
  /** Pile affichée — remplie une seule fois à MOVE_FEED_READY (évite flash profils intermédiaires). */
  const [stableProfiles, setStableProfiles] = useState<ProfileWithAffinity[]>([]);
  const [feedReady, setFeedReady] = useState(false);
  const [mySportMatchKeys, setMySportMatchKeys] = useState<Set<string>>(new Set());
  const myCity = useMemo(() => {
    const raw = profile && typeof profile === "object" ? (profile as { city?: string | null }).city : null;
    if (typeof raw !== "string") return null;
    const short = formatCityDisplay(raw);
    return short !== "" ? short : null;
  }, [profile]);
  const [myDiscoveryRadiusKm] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  /** Viewer sans lat/lng valides : aucun candidat, état vide dédié (pas d’erreur réseau). */
  const [viewerGeoBlocked, setViewerGeoBlocked] = useState(false);
  const [reportProfileId, setReportProfileId] = useState<string | null>(null);
  const [reportPhotoTarget, setReportPhotoTarget] = useState<{
    profileId: string;
    portraitUrl: string | null;
    fullbodyUrl: string | null;
  } | null>(null);
  const [likeFeedbackMode, setLikeFeedbackMode] = useState<null | "like" | "match">(null);
  const [likeActionError, setLikeActionError] = useState<string | null>(null);
  const [discoverMenuProfileId, setDiscoverMenuProfileId] = useState<string | null>(null);
  const [blockActionError, setBlockActionError] = useState<string | null>(null);
  const [boostLifecycleMessage, setBoostLifecycleMessage] = useState<string | null>(null);
  /** Same row object as weekly suggestions / main feed — avoids find-by-id mismatch for Like. */
  const [previewProfile, setPreviewProfile] = useState<ProfileWithAffinity | null>(null);
  const likeInFlightRef = useRef<Set<string>>(new Set());
  const blockInFlightRef = useRef<Set<string>>(new Set());
  const prevBoostActiveRef = useRef(false);
  const { boostStats } = useSplovePlus(currentUserId || null);
  const [rewindStatus, setRewindStatus] = useState<DiscoverRewindStatus | null>(null);
  const rewindBusy = false;
  const [rewindError, setRewindError] = useState<string | null>(null);
  const [rewindToast, setRewindToast] = useState<string | null>(null);
  const [rewindRestoredId, setRewindRestoredId] = useState<string | null>(null);
  const [rewindRestoredFrom, setRewindRestoredFrom] = useState<"left" | "right">("left");
  const [restoredProfileId, setRestoredProfileId] = useState<string | null>(null);
  const [lastRestoredProfileId, setLastRestoredProfileId] = useState<string | null>(null);
  const [swipeHistory, setSwipeHistory] = useState<DiscoverSwipeHistoryEntry[]>([]);
  const swipeHistoryRef = useRef<DiscoverSwipeHistoryEntry[]>([]);
  /** Pile locale des profils passés (non vidée au rechargement feed). */
  const undoStackRef = useRef<ProfileWithAffinity[]>([]);
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  const [undoStackTick, setUndoStackTick] = useState(0);
  const [undoCreditTick, setUndoCreditTick] = useState(0);
  const [localUndoCredits, setLocalUndoCredits] = useState(0);
  /** Profils passés localement (évite réapparition immédiate si le feed recharge). */
  const passedProfileIdsRef = useRef<Set<string>>(new Set());
  const [passedFilterTick, setPassedFilterTick] = useState(0);
  /** Like/pass explicite en cours — ne pas traiter comme « vu sans action ». */
  const explicitSwipeProfileIdRef = useRef<string | null>(null);
  const topProfileIdRef = useRef<string | null>(null);
  const previewProfileIdRef = useRef<string | null>(null);
  previewProfileIdRef.current = previewProfile?.id ?? null;
  const profileViewOrderingRef = useRef<DiscoverProfileViewOrderingState>(
    createEmptyProfileViewOrderingState(),
  );
  const [profileViewOrderTick, setProfileViewOrderTick] = useState(0);
  const skeletonLogKeyRef = useRef<string | null>(null);
  const neutralSkeletonLogKeyRef = useRef<string | null>(null);
  const firstStableProfileLoggedRef = useRef(false);

  const patchDiscoverStackProfiles = useCallback(
    (updater: (prev: ProfileWithAffinity[]) => ProfileWithAffinity[]) => {
      setProfiles((prev) => {
        const next = takeDiscoverProfilesWithValidGps(updater(prev));
        setStableProfiles(next);
        return next;
      });
    },
    [],
  );

  const feedReadyRef = useRef(feedReady);
  feedReadyRef.current = feedReady;

  /** Vide la pile affichée — skeleton immédiat (avant le async loadProfiles). */
  const beginMoveFeedLoad = useCallback(() => {
    setFeedReady(false);
    setStableProfiles([]);
    setProfiles([]);
    setLoading(true);
    firstStableProfileLoggedRef.current = false;
    skeletonLogKeyRef.current = null;
  }, []);

  /** Liste utilisée pour le rendu des cartes — exclusion absolue sans lat/lng valides (doublon de sécurité). */
  const profilesCardStack = useMemo(
    () => {
      if (!feedReady) return [];
      return orderDiscoverProfilesByProfileViews(
        takeDiscoverProfilesWithValidGps(
          stableProfiles.filter((p) => !passedProfileIdsRef.current.has(p.id)),
        ),
        profileViewOrderingRef.current,
      );
    },
    [feedReady, stableProfiles, passedFilterTick, profileViewOrderTick],
  );

  const moveFeedLoading = loading;
  /** Bloque tout rendu de profil réel (cartes, preview, ids UI). */
  const blockProfileUi =
    !feedReady || moveFeedLoading || isProfileLoading;
  /** Skeleton neutre — aucune donnée utilisateur tant que le feed n’est pas prêt. */
  const showMoveSkeleton =
    !errorMessage && !loadingTimedOut && blockProfileUi;

  /** Cartes réelles — jamais avant MOVE_FEED_READY ni pendant chargement. */
  const canRenderFeedCards =
    !blockProfileUi &&
    !errorMessage &&
    !viewerGeoBlocked &&
    profilesCardStack.length > 0;

  useEffect(() => {
    topProfileIdRef.current = profilesCardStack[0]?.id ?? null;
  }, [profilesCardStack]);

  const rotateCurrentProfileWithoutAction = useCallback(() => {
    const uid = currentUserIdRef.current;
    const profileId = previewProfileIdRef.current ?? topProfileIdRef.current;
    if (!uid || !profileId) return;
    if (explicitSwipeProfileIdRef.current === profileId) return;
    if (passedProfileIdsRef.current.has(profileId)) return;

    profileViewOrderingRef.current = applyLocalProfileViewWithoutAction(
      profileViewOrderingRef.current,
      profileId,
    );
    setProfileViewOrderTick((n) => n + 1);
    void recordProfileViewWithoutAction(uid, profileId);
    setProfiles((prev) => {
      if (!feedReadyRef.current) return prev;
      const rotated = rotateProfileToEndOfStack(prev, profileId);
      if (!rotated) return prev;
      console.log("[Discover] profile rotated without action", { profileId });
      setStableProfiles(rotated);
      return rotated;
    });
  }, []);

  useEffect(() => {
    if (!isMoveRoute) return;
    return () => {
      rotateCurrentProfileWithoutAction();
    };
  }, [isMoveRoute, rotateCurrentProfileWithoutAction]);

  useEffect(() => {
    if (!isMoveRoute) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        rotateCurrentProfileWithoutAction();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isMoveRoute, rotateCurrentProfileWithoutAction]);
  /** Dernière implémentation de handleUndoTap (hoisted) pour la nav basse sans dépendances instables. */
  const undoTapLatestRef = useRef<() => Promise<void>>(async () => {});
  const [secondChanceTarget, setSecondChanceTarget] = useState<ProfileWithAffinity | null>(null);
  const [secondChanceModalOpen, setSecondChanceModalOpen] = useState(false);
  const [secondChanceToast, setSecondChanceToast] = useState<string | null>(null);
  const [pendingMatchIntro, setPendingMatchIntro] = useState<{
    conversationId: string;
    partnerFirstName: string | null;
    partnerMainPhotoUrl: string | null;
    partnerGender: string | null;
    partnerIntent: unknown;
    partnerSportPracticeType: string | null;
    sharedSports: string[];
    matchedByUserId: string;
  } | null>(null);
  useEffect(() => {
    swipeHistoryRef.current = swipeHistory;
  }, [swipeHistory]);

  const syncLocalUndoCredits = useCallback(() => {
    const uid = currentUserIdRef.current;
    const next = uid ? getDiscoverUndoCreditCount(uid) : 0;
    setLocalUndoCredits(next);
    return next;
  }, []);

  useEffect(() => {
    syncLocalUndoCredits();
  }, [currentUserId, syncLocalUndoCredits]);

  useEffect(() => {
    const onUndoCreditChange = (ev: Event) => {
      const detail = (ev as CustomEvent<DiscoverUndoCreditEventDetail>).detail;
      const uid = currentUserIdRef.current;
      if (detail?.userId && uid && detail.userId !== uid) return;
      syncLocalUndoCredits();
      setUndoCreditTick((n) => n + 1);
    };
    window.addEventListener(DISCOVER_UNDO_CREDIT_EVENT, onUndoCreditChange);
    return () => window.removeEventListener(DISCOVER_UNDO_CREDIT_EVENT, onUndoCreditChange);
  }, [syncLocalUndoCredits]);

  const serverRewindAvailable = useMemo(() => {
    if (!rewindStatus) return false;
    if (rewindStatus.last_is_match) return false;
    if (!rewindStatus.last_swipe_at) return false;
    return isLastSwipeRewindable(rewindStatus.last_action);
  }, [rewindStatus]);

  const profileUndoFlags = useMemo(() => {
    const row = (profile as Record<string, unknown> | null) ?? null;
    return {
      hasUndoFeature: row?.has_undo_feature === true,
      profileUndoCredits:
        typeof row?.undo_credits === "number" ? Math.max(0, Math.floor(row.undo_credits)) : 0,
      profileCanRewind: row?.can_rewind === true,
      packSplovePlusIncludesUndo:
        row?.pack_splove_plus_includes_undo === true ||
        row?.splove_plus_pack_includes_undo === true ||
        row?.has_splove_plus_pack === true,
    };
  }, [profile]);

  /** Undo autorisé seulement si un profil local est disponible ET un droit produit existe. */
  const canUndo = useMemo(() => {
    const hasLocalStack = undoStackRef.current.length > 0;
    if (!hasLocalStack) return false;
    const hasUndoRight =
      localUndoCredits > 0 ||
      hasDiscoverUndoCredit(currentUserId) ||
      profileUndoFlags.hasUndoFeature ||
      profileUndoFlags.profileUndoCredits > 0 ||
      profileUndoFlags.profileCanRewind ||
      profileUndoFlags.packSplovePlusIncludesUndo;
    return hasUndoRight;
  }, [undoStackTick, undoCreditTick, localUndoCredits, currentUserId, profileUndoFlags]);

  useEffect(() => {
    if (!isMoveRoute) return;
    console.log("[Discover] undo state", {
      stackSize: undoStackRef.current.length,
      localCredit: localUndoCredits,
      serverCanUndo: serverRewindAvailable,
      hasUndoFeature: profileUndoFlags.hasUndoFeature,
      profileUndoCredits: profileUndoFlags.profileUndoCredits,
      profileCanRewind: profileUndoFlags.profileCanRewind,
      packSplovePlusIncludesUndo: profileUndoFlags.packSplovePlusIncludesUndo,
    });
  }, [isMoveRoute, undoStackTick, undoCreditTick, localUndoCredits, serverRewindAvailable, profileUndoFlags]);
  const [crossingsOpen, setCrossingsOpen] = useState(false);
  const [crossingsLoading, setCrossingsLoading] = useState(false);
  const [crossingList, setCrossingList] = useState<
    { target_id: string; state: string; first_name: string | null }[]
  >([]);
  const referralVariant = useMemo(
    () => (currentUserId ? getReferralVariant(currentUserId) : "A"),
    [currentUserId],
  );
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [referralCodeState, setReferralCodeState] = useState<string | null>(null);
  const inviteViewTrackedRef = useRef(false);
  const referralModalWasOpenRef = useRef(false);
  const [localImpact, setLocalImpact] = useState({
    invitesCount: 0,
    successfulReferrals: 0,
    boostCredits: 0,
  });
  const [localImpactLoading, setLocalImpactLoading] = useState(false);

  const loadLocalImpact = useCallback(async () => {
    if (!currentUserId) return;
    setLocalImpactLoading(true);
    try {
      const [invitesCount, successfulReferrals, growth] = await Promise.all([
        countReferralsRowsByReferrer(currentUserId),
        countReferralsAsReferrer(currentUserId),
        fetchGrowthProfileFields(currentUserId),
      ]);
      const bc = growth?.boost_credits;
      const boostCredits =
        typeof bc === "number" && Number.isFinite(bc) ? Math.max(0, Math.floor(bc)) : 0;
      setLocalImpact({ invitesCount, successfulReferrals, boostCredits });
    } finally {
      setLocalImpactLoading(false);
    }
  }, [currentUserId]);

  const refreshRewindStatus = useCallback(() => {
    void getDiscoverRewindStatus()
      .then(setRewindStatus)
      .catch((e) => {
        console.warn("[Discover diagnostics] getDiscoverRewindStatus rejected", e);
      });
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log("[Discover] session", session);
    console.log("[Discover] profile", profile);
    console.log("[Discover] isProfileLoading", isProfileLoading);
  }, [session, profile, isProfileLoading]);

  const discoverShellVisibleLoggedRef = useRef(false);
  const firstCardVisibleLoggedRef = useRef(false);
  const emptyStateVisibleLoggedRef = useRef(false);
  const [shellForceVisible, setShellForceVisible] = useState(false);

  useEffect(() => {
    if (!isOauthProcessingLocked()) return;
    clearOauthProcessingLock();
    console.warn("[Discover] cleared stale oauth processing lock");
  }, []);

  const hasSessionUser = Boolean(session?.user?.id ?? user?.id);
  const appAuthReady = isAppAuthReady({ isAuthInitialized, session, profile });
  const profileCompletedReady =
    Boolean(currentUserId) &&
    profile?.id === currentUserId &&
    profile.profile_completed === true;
  const showDiscoverShell =
    hasSessionUser ||
    (isMoveRoute && isAuthInitialized && !authLoading) ||
    shellForceVisible ||
    profileCompletedReady ||
    appAuthReady;

  useEffect(() => {
    if (profileCompletedReady) {
      setShellForceVisible(true);
    }
  }, [profileCompletedReady]);

  useEffect(() => {
    if (showDiscoverShell) return;
    const timer = window.setTimeout(() => {
      if (hasSessionUser || profileCompletedReady || session?.user?.id) {
        setShellForceVisible(true);
      }
    }, POST_LOGIN_BOOT_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [showDiscoverShell, hasSessionUser, profileCompletedReady, session?.user?.id]);

  useEffect(() => {
    firstStableProfileLoggedRef.current = false;
    skeletonLogKeyRef.current = null;
    neutralSkeletonLogKeyRef.current = null;
    setFeedReady(false);
    setStableProfiles([]);
    setProfiles([]);
    setLoading(true);
  }, [currentUserId]);

  useEffect(() => {
    if (!showMoveSkeleton) {
      skeletonLogKeyRef.current = null;
      return;
    }
    setPreviewProfile(null);
    setDiscoverMenuProfileId(null);
    setSecondChanceTarget(null);
    setSecondChanceModalOpen(false);
    const reason = !feedReady
      ? "feed_not_ready"
      : isProfileLoading
        ? "profile_loading"
        : "feed_loading";
    const logKey = `${reason}:${isProfileLoading}:${feedReady}:${moveFeedLoading}`;
    if (skeletonLogKeyRef.current === logKey) return;
    skeletonLogKeyRef.current = logKey;
    console.log("MOVE_SKELETON_VISIBLE", { reason, isProfileLoading, feedReady, moveFeedLoading });
  }, [showMoveSkeleton, feedReady, isProfileLoading, moveFeedLoading]);

  useEffect(() => {
    if (!showMoveSkeleton) {
      neutralSkeletonLogKeyRef.current = null;
      return;
    }
    const logKey = `${feedReady}:${isProfileLoading}:${moveFeedLoading}`;
    if (neutralSkeletonLogKeyRef.current === logKey) return;
    neutralSkeletonLogKeyRef.current = logKey;
    console.log("MOVE_SKELETON_NEUTRAL_RENDERED", {
      feedReady,
      isProfileLoading,
      moveFeedLoading,
    });
  }, [showMoveSkeleton, feedReady, isProfileLoading, moveFeedLoading]);

  useEffect(() => {
    if (!feedReady || stableProfiles.length === 0) return;
    if (firstStableProfileLoggedRef.current) return;
    firstStableProfileLoggedRef.current = true;
    console.log("MOVE_FIRST_STABLE_PROFILE_RENDERED", {
      profileId: stableProfiles[0]?.id,
      count: stableProfiles.length,
    });
  }, [feedReady, stableProfiles]);

  useEffect(() => {
    if (!showDiscoverShell || discoverShellVisibleLoggedRef.current) return;
    discoverShellVisibleLoggedRef.current = true;
    console.log("MOVE_RENDER_START");
    console.log("[Discover] visible");
    logDiscoverShellVisible(shellForceVisible);
  }, [showDiscoverShell, shellForceVisible]);

  useEffect(() => {
    if (loading || !feedReady) return;
    if (profilesCardStack.length > 0) {
      if (firstCardVisibleLoggedRef.current) return;
      firstCardVisibleLoggedRef.current = true;
      logDiscoverFirstCardVisible();
      return;
    }
    if (!viewerGeoBlocked && !errorMessage) return;
    if (emptyStateVisibleLoggedRef.current) return;
    emptyStateVisibleLoggedRef.current = true;
    logDiscoverEmptyStateVisible();
  }, [loading, feedReady, errorMessage, viewerGeoBlocked, profilesCardStack.length]);

  useEffect(() => {
    inviteViewTrackedRef.current = false;
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    const cancelDefer = deferSecondaryWork(() => {
      void runPostLoginOptionalBatch("discover", async () => {
        refreshRewindStatus();
        const code = await getOrCreateReferralCode(
          currentUserId,
          profile?.first_name ?? null,
        ).catch((e) => {
          console.warn("[Discover] getOrCreateReferralCode skipped", e);
          return null;
        });
        if (!cancelled && code) setReferralCodeState(code);
        await loadLocalImpact().catch((e) => {
          console.warn("[Discover] loadLocalImpact skipped", e);
        });
        if (!DISCOVER_BETA_SIMPLE_PIPELINE) {
          await mergeDiscoverViewerOptionalFields(
            supabase,
            currentUserId,
            mergeOptionalProfileFields,
          ).catch(() => undefined);
        }
      });
    }, 3_000);
    return () => {
      cancelled = true;
      cancelDefer();
    };
  }, [currentUserId, profile?.first_name, refreshRewindStatus, loadLocalImpact]);

  useEffect(() => {
    if (referralModalWasOpenRef.current && !referralModalOpen && currentUserId) {
      void loadLocalImpact().catch((e) => {
        console.warn("[Discover diagnostics] loadLocalImpact (modal-close) rejected", e);
      });
    }
    referralModalWasOpenRef.current = referralModalOpen;
  }, [referralModalOpen, currentUserId, loadLocalImpact]);

  useEffect(() => {
    const eligible =
      Boolean(currentUserId) &&
        feedReady &&
        !loading &&
        !errorMessage &&
        !viewerGeoBlocked &&
        profilesCardStack.length <= 3;
    if (!eligible || inviteViewTrackedRef.current) return;
    inviteViewTrackedRef.current = true;
    const cancelDefer = deferSecondaryWork(() => {
      void trackReferralEvent("invite_view", { variant: referralVariant, source: "discover" }).catch(
        (e) => {
          console.warn("[Discover] referral_events skipped", e);
        },
      );
    }, 2_200);
    return () => cancelDefer();
  }, [currentUserId, feedReady, loading, errorMessage, viewerGeoBlocked, profilesCardStack.length, referralVariant]);

  function openReportPhotoFromDiscover(p: ProfileWithAffinity) {
    setDiscoverMenuProfileId(null);
    setPreviewProfile(null);
    setReportPhotoTarget({
      profileId: p.id,
      portraitUrl: String(p.portrait_url ?? p.main_photo_url ?? "").trim() || null,
      fullbodyUrl: String(p.fullbody_url ?? "").trim() || null,
    });
  }

  useEffect(() => {
    if (!likeFeedbackMode) return;
    const t = window.setTimeout(() => setLikeFeedbackMode(null), 6000);
    return () => window.clearTimeout(t);
  }, [likeFeedbackMode]);

  useEffect(() => {
    if (!likeActionError) return;
    const t = window.setTimeout(() => setLikeActionError(null), 5000);
    return () => window.clearTimeout(t);
  }, [likeActionError]);

  useEffect(() => {
    if (!blockActionError) return;
    const t = window.setTimeout(() => setBlockActionError(null), 5000);
    return () => window.clearTimeout(t);
  }, [blockActionError]);

  useEffect(() => {
    if (!boostLifecycleMessage) return;
    const t = window.setTimeout(() => setBoostLifecycleMessage(null), 3000);
    return () => window.clearTimeout(t);
  }, [boostLifecycleMessage]);

  useEffect(() => {
    if (!rewindError) return;
    const t = window.setTimeout(() => setRewindError(null), 5000);
    return () => window.clearTimeout(t);
  }, [rewindError]);

  useEffect(() => {
    if (!rewindToast) return;
    const t = window.setTimeout(() => setRewindToast(null), 1800);
    return () => window.clearTimeout(t);
  }, [rewindToast]);

  useEffect(() => {
    if (!rewindRestoredId) return;
    const t = window.setTimeout(() => setRewindRestoredId(null), 320);
    return () => window.clearTimeout(t);
  }, [rewindRestoredId]);

  useEffect(() => {
    if (!restoredProfileId) return;
    const tm = window.setTimeout(() => setRestoredProfileId(null), 1200);
    return () => window.clearTimeout(tm);
  }, [restoredProfileId]);

  useEffect(() => {
    if (!secondChanceToast) return;
    const t = window.setTimeout(() => setSecondChanceToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [secondChanceToast]);

  useEffect(() => {
    const active = boostStats.isActive;
    if (prevBoostActiveRef.current && !active) {
      setBoostLifecycleMessage(
        language === "en"
          ? `Boost ended - ${boostStats.views} views reached`
          : `Boost termine - ${boostStats.views} vues obtenues`,
      );
    }
    prevBoostActiveRef.current = active;
  }, [boostStats.isActive, boostStats.views, language]);

  useEffect(() => {
    if (!discoverMenuProfileId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.("[data-discover-menu-root]")) return;
      setDiscoverMenuProfileId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [discoverMenuProfileId]);

  /** SPLove+ / navigation externe : ouvrir la même modale « fiche » que le tap sur une carte Discover. */
  useEffect(() => {
    const navState = (location.state as
      | { profileId?: string; openProfile?: boolean; openProfileId?: string }
      | null);
    const explicitProfileId = typeof navState?.profileId === "string" ? navState.profileId : null;
    const legacyProfileId = typeof navState?.openProfileId === "string" ? navState.openProfileId : null;
    const requestedProfileId = explicitProfileId ?? legacyProfileId;
    const shouldOpen = navState?.openProfile === true || Boolean(legacyProfileId);
    console.log("DISCOVER_OPEN_PROFILE_ID", requestedProfileId ?? null);
    if (!shouldOpen || !requestedProfileId || !isValidProfileId(requestedProfileId) || !currentUserId) {
      return;
    }
    if (handledPreviewNavKeyRef.current === location.key) return;
    handledPreviewNavKeyRef.current = location.key;

    const fromFeed = profiles.find((p) => p.id === requestedProfileId) ?? null;
    if (fromFeed) {
      if (!hasFiniteDiscoverCoordinates(fromFeed)) return;
      setDiscoverMenuProfileId(null);
      setPreviewProfile(fromFeed);
      console.log("DISCOVER_SELECTED_PROFILE", fromFeed.id);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const viewerAuthId = user?.id ?? currentUserId;
        const [meRes, meSportsRes, candRes] = await Promise.all([
          supabase.from("profiles").select(DISCOVER_VIEWER_ME_SELECT).eq("id", viewerAuthId).maybeSingle(),
          supabase.from("profile_sports").select("sports(slug, label)").eq("profile_id", viewerAuthId),
          supabase.from("profiles").select(DISCOVER_PROFILES_DETAIL_SELECT).eq("id", requestedProfileId).maybeSingle(),
        ]);
        if (cancelled) return;

        const meProfileSportRows = Array.isArray(meSportsRes.data) ? meSportsRes.data : [];
        const meProfileOptional = {} as Partial<Profile>;
        void mergeDiscoverViewerOptionalFields(
          supabase,
          viewerAuthId,
          mergeOptionalProfileFields,
        ).catch(() => undefined);
        const meProfile: Profile =
          meRes.data != null
            ? {
                ...(meRes.data as unknown as Profile),
                ...meProfileOptional,
                profile_sports: meProfileSportRows as unknown as NonNullable<Profile["profile_sports"]>,
              }
            : {
                id: viewerAuthId,
                first_name: null,
                ...meProfileOptional,
                profile_sports: meProfileSportRows as unknown as NonNullable<Profile["profile_sports"]>,
              };

        if (!viewerHasDiscoverSearchCoords(meProfile)) {
          console.warn(
            "[Discover audit] VIEWER_SEARCH_GEO_BLOCKED (navigation) — lat/lng/radius invalide.",
            {
              latitude: meProfile.latitude ?? null,
              longitude: meProfile.longitude ?? null,
              discovery_radius_km: meProfile.discovery_radius_km ?? null,
            },
          );
          return;
        }

        let p = candRes.data as Profile | null;
        if (!p || candRes.error) {
          let feedProbe = await supabase
            .from(DISCOVER_FEED_SOURCE)
            .select("id")
            .eq("id", requestedProfileId)
            .maybeSingle();
          if (feedProbe.error && isFeedQueryColumnError(feedProbe.error)) {
            feedProbe = await supabase
              .from(DISCOVER_FEED_SOURCE)
              .select("profile_id")
              .eq("profile_id", requestedProfileId)
              .maybeSingle();
          }
          if (cancelled) return;
          const row = feedProbe.data as { id?: string; profile_id?: string } | null;
          const probeId = row && isValidProfileId(row.id) ? row.id : row && isValidProfileId(row.profile_id) ? row.profile_id : null;
          if (!feedProbe.error && probeId) {
            const retry = await supabase
              .from("profiles")
              .select(DISCOVER_PROFILES_DETAIL_SELECT)
              .eq("id", requestedProfileId)
              .maybeSingle();
            if (!retry.error && retry.data) {
              p = retry.data as unknown as Profile;
            }
          }
        }
        if (!p) {
          console.warn("[Discover] openProfileFromNavigation: profil introuvable", requestedProfileId, candRes.error?.message);
          return;
        }
        if (!hasFiniteDiscoverCoordinates(p)) {
          console.warn("[Discover] openProfileFromNavigation: candidat sans GPS — aperçu ignoré", {
            profile_id: requestedProfileId,
          });
          return;
        }

        const sportsSet = collectSportMatchKeysFromProfile(meProfile);
        const distById = DISCOVER_BETA_SIMPLE_PIPELINE
          ? buildClientDiscoverDistanceById(meProfile, [
              { id: requestedProfileId, latitude: p.latitude, longitude: p.longitude },
            ])
          : await fetchProfileDistancesOptional([requestedProfileId]);
        const distanceKm = distById.get(requestedProfileId) ?? null;

        const discover = buildDiscoverScore(p, {
          mySportMatchKeys: sportsSet,
          myProfile: meProfile,
          distanceKmOverride: distanceKm ?? undefined,
        });
        let common = 0;
        try {
          common = commonSportsCount(sportsSet, p);
        } catch {
          /* ignore */
        }

        let enriched: ProfileWithAffinity = {
          ...p,
          commonSportsCount: discover.sharedSportsCount || (Number.isFinite(common) ? common : 0),
          discoverScore: discover.score,
          practice_score: practiceCompatibilityScore(meProfile.sport_practice_type, p.sport_practice_type),
          distanceKm: discover.distanceKm,
          discover_reasons: discover.reasons,
          discover_excluded: discover.excluded,
          reliabilityScore: computeReliabilityScore(p),
        };

        const { data: sharedRows } = await supabase.rpc("discover_shared_place_flags", {
          p_viewer_id: currentUserId,
          p_candidate_ids: [requestedProfileId],
        });
        if (cancelled) return;

        const flags = (sharedRows ?? []) as { profile_id?: string; has_shared_place?: boolean }[];
        const has_shared_place = flags.some(
          (r) => r.profile_id === requestedProfileId && r.has_shared_place === true,
        );
        enriched = { ...enriched, has_shared_place };

        setDiscoverMenuProfileId(null);
        setPreviewProfile(enriched);
        console.log("DISCOVER_SELECTED_PROFILE", enriched.id);
      } catch (e) {
        console.error("[Discover] openProfileFromNavigation", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.state, location.key, currentUserId, user?.id, profiles]);

  const closePreviewModal = useMemo(() => {
    return () => {
      const navState = (location.state as { returnTo?: string } | null);
      const returnTo = navState?.returnTo;
      if (typeof returnTo === "string" && returnTo.trim().length > 0) {
        navigate(returnTo === "/likes" ? "/likes-you" : returnTo, { replace: true });
        return;
      }
      setPreviewProfile(null);
    };
  }, [location.state, navigate]);

  const authUserIdRef = useRef(user?.id);
  authUserIdRef.current = user?.id;

  useEffect(() => {
    if (authLoading) {
      console.debug("[Discover debug] authLoading=true — attente AuthContext");
      return;
    }
    if (!user?.id) {
      const cancelDefer = deferSecondaryWork(() => {
        if (authUserIdRef.current) return;
        console.error("[Discover debug] BLOCKER: pas de user.id après auth — session absente", {
          authLoading,
        });
        setLoading(false);
        setFeedReady(true);
        setErrorMessage((prev) => prev || "Impossible de charger votre session. Reconnectez-vous.");
      }, 700);
      return () => cancelDefer();
    }
    beginMoveFeedLoad();
    let cancelled = false;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled) return;
        void loadProfiles().catch((e) => {
          console.warn("[Discover diagnostics] loadProfiles rejected", e);
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [authLoading, user?.id, profile, discoverPreferredAgeFingerprint, beginMoveFeedLoad]);

  useEffect(() => {
    if (!user?.id || !loading) return;
    const timer = window.setTimeout(() => {
      loadProfilesInFlightRef.current = false;
      setLoading(false);
      setLoadingTimedOut(true);
    }, POST_LOGIN_BOOT_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [user?.id, loading]);

  useEffect(() => {
    if (!hasPlus || !feedReady) return;
    patchDiscoverStackProfiles((prev) => {
      if (prev.length === 0) return prev;
      const sorted = [...prev].sort((a, b) => sortDiscoverProfileStack(a, b, true));
      return reapplyColdLaunchMoveProfileRotation(currentUserId, sorted);
    });
  }, [hasPlus, feedReady, patchDiscoverStackProfiles, currentUserId]);

  async function loadProfiles() {
    if (loadProfilesInFlightRef.current) {
      loadProfilesPendingReloadRef.current = true;
      beginMoveFeedLoad();
      return;
    }
    loadProfilesInFlightRef.current = true;
    console.log("MOVE_FEED_LOADING");
    beginMoveFeedLoad();
    if (!currentUserId) {
      if (import.meta.env.DEV) {
        console.info("[Discover diagnostics] early_return", {
          stage: "loadProfiles:start",
          exclusion_reason: "missing currentUserId",
        });
      }
      setViewerGeoBlocked(false);
      setFeedReady(true);
      setLoading(false);
      loadProfilesInFlightRef.current = false;
      return;
    }
    setLoadingTimedOut(false);
    setErrorMessage("");
    setViewerGeoBlocked(false);
    let resultCount = 0;
    const profileViewsOrderingPromise = fetchDiscoverProfileViewOrderingState(currentUserId);
    try {
      console.log("[Discover feed] currentUserId:", currentUserId);
      void (async () => {
        try {
          await supabase.rpc("touch_profile_activity");
        } catch (e) {
          console.warn("[Discover diagnostics] optional touch_profile_activity skipped", e);
        }
      })();

      const viewerAuthId = user?.id ?? currentUserId;
      const authViewer =
        profile?.id === viewerAuthId && viewerHasDiscoverSearchCoords(profile as Profile)
          ? (profile as Profile)
          : null;

      let likedIds = new Set<string>();
      let matchedIds = new Set<string>();
      let blockDetail: BlockExclusionDetail = {
        excluded: new Set<string>(),
        rowsWhereIAmBlocker: [],
        rowsWhereIAmBlocked: [],
        errors: [],
      };
      let feedResultEarly: Awaited<ReturnType<typeof fetchDiscoverFeedAlive>> | null = null;

      let meRes: { data: unknown; error: { code?: string; message?: string } | null };
      let meSportsRes: { data: unknown; error: { message?: string } | null };

      if (DISCOVER_BETA_SIMPLE_PIPELINE) {
        let feedLocal: Awaited<ReturnType<typeof fetchDiscoverFeedAlive>>;
        try {
          const [meResLocal, meSportsResLocal, feedFetched] = await Promise.all([
            authViewer
              ? Promise.resolve({ data: authViewer, error: null })
              : supabase.from("profiles").select(DISCOVER_VIEWER_ME_SELECT).eq("id", viewerAuthId).maybeSingle(),
            supabase.from("profile_sports").select("sport_id, sports(id, slug, label)").eq("profile_id", viewerAuthId),
            fetchDiscoverFeedAlive(12, currentUserId),
          ]);
          meRes = meResLocal;
          meSportsRes = meSportsResLocal;
          feedLocal = feedFetched;
        } catch (e) {
          console.warn("[Discover] loadProfiles beta bootstrap", e);
          throw e;
        }
        feedResultEarly = feedLocal;
      } else {
        const [likedLocal, matchedLocal, meResLocal, meSportsResLocal, blockLocal] = await Promise.all([
          fetchOutgoingLikedUserIds(currentUserId),
          fetchMatchedUserIds(currentUserId),
          authViewer
            ? Promise.resolve({ data: authViewer, error: null })
            : supabase.from("profiles").select(DISCOVER_VIEWER_ME_SELECT).eq("id", viewerAuthId).maybeSingle(),
          supabase.from("profile_sports").select("sport_id, sports(id, slug, label)").eq("profile_id", viewerAuthId),
          fetchBlockExclusionDetail(currentUserId),
        ]);
        likedIds = likedLocal;
        matchedIds = matchedLocal;
        meRes = meResLocal;
        meSportsRes = meSportsResLocal;
        blockDetail = blockLocal;
      }

      const meProfileSportRows = Array.isArray(meSportsRes.data) ? meSportsRes.data : [];
      let meProfile: Profile =
        meRes.data != null
          ? {
              ...(meRes.data as unknown as Profile),
              profile_sports: meProfileSportRows as unknown as NonNullable<Profile["profile_sports"]>,
            }
          : {
              id: viewerAuthId,
              first_name: null,
              profile_sports: meProfileSportRows as unknown as NonNullable<Profile["profile_sports"]>,
            };
      const sportPrefRaw = meProfile.sport_match_preference;
      if (!(typeof sportPrefRaw === "string" && sportPrefRaw.trim().length > 0)) {
        meProfile = await ensureViewerSportMatchPreferenceLoaded(meProfile, viewerAuthId);
      }
      logSportMatchPreferenceScoringTrace("viewer_after_profile_load", meProfile.sport_match_preference);

      if (meSportsRes.error) {
        console.warn("[Discover] viewer profile_sports query failed:", meSportsRes.error.message);
      }
      const blockExclude = blockDetail.excluded;
      const sportsSet = collectSportMatchKeysFromProfile(meProfile);
      setMySportMatchKeys(sportsSet);
      if (import.meta.env.DEV) {
        const viewerGenderNormalized = discoverCanonicalGender(meProfile.gender ?? null);
        const viewerLookingForNormalized = [...discoverParseLookingFor(meProfile.looking_for ?? null)];
        const viewerProfileSportIds = discoverExtractProfileSportIds(meProfile);
        console.info("[Discover diagnostics] viewer_profile", {
          auth_user_id: viewerAuthId,
          current_profile_fetch_error: meRes.error ?? null,
          current_profile_fetch_result: meRes.data ?? null,
          current_profile_optional_merge_keys: [],
          current_profile_profile_sports_error: meSportsRes.error ?? null,
          current_profile_id_used: meRes.data ? viewerAuthId : null,
          current_profile_sports_match_keys: [...sportsSet],
          raw_db_gender: meProfile.gender ?? null,
          normalized_gender: viewerGenderNormalized,
          raw_db_looking_for: meProfile.looking_for ?? null,
          normalized_looking_for: viewerLookingForNormalized,
          loaded_profile_sports_ids: viewerProfileSportIds,
        });
      }
      if (meRes.error) {
        console.warn("[Discover] profil courant query failed", {
          code: meRes.error.code,
          message: meRes.error.message,
          error: meRes.error,
        });
      }
      if (!meRes.data) {
        if (import.meta.env.DEV) {
          console.info("[Discover diagnostics] viewer_profile_missing", {
            auth_user_id: currentUserId,
            exclusion_reason: meRes.error ? "RLS/no row" : "profile fetch failed",
            current_profile_fetch_error: meRes.error ?? null,
          });
          console.info("[Discover diagnostics] early_return", {
            stage: "viewer_profile_check",
            exclusion_reason: meRes.error ? "viewer profile fetch error" : "viewer profile missing",
            current_profile_fetch_error: meRes.error ?? null,
          });
        }
        setErrorMessage("Impossible de charger ton profil courant.");
        setViewerGeoBlocked(false);
        setProfiles([]);
        setStableProfiles([]);
        swipeHistoryRef.current = [];
        setSwipeHistory([]);
        setLoading(false);
        setFeedReady(true);
        return;
      }

      {
        const vLatOk =
          typeof meProfile.latitude === "number" && Number.isFinite(meProfile.latitude);
        const vLngOk =
          typeof meProfile.longitude === "number" && Number.isFinite(meProfile.longitude);
        if (!vLatOk || !vLngOk) {
          console.warn("[Discover audit] missing viewer coordinates", {
            profile_id: viewerAuthId,
            latitude: meProfile.latitude ?? null,
            longitude: meProfile.longitude ?? null,
          });
        }
        if (!meSportsRes.error && meProfileSportRows.length === 0) {
          console.warn("[Discover audit] no sports selected", { profile_id: viewerAuthId });
        }
      }

      if (blockDetail.errors.length > 0) {
        console.warn("[Discover feed] blocks exclusion RPC errors:", blockDetail.errors);
      }

      if (!viewerHasDiscoverSearchCoords(meProfile)) {
        console.warn(
          "[Discover audit] VIEWER_SEARCH_GEO_BLOCKED — Latitude, longitude ou discovery_radius_km (10 / 25 / 50 / 100) manquant ou invalide. Discover ne charge pas le feed.",
          {
            latitude: meProfile.latitude ?? null,
            longitude: meProfile.longitude ?? null,
            discovery_radius_km: meProfile.discovery_radius_km ?? null,
            city: meProfile.city ?? null,
          },
        );
        setViewerGeoBlocked(true);
        setSwipeHistory([]);
        swipeHistoryRef.current = [];
        setProfiles([]);
        setStableProfiles([]);
        setErrorMessage("");
        discoverLogStageCount("viewer geo/radius incomplete — skip feed", 0);
        setLoading(false);
        setFeedReady(true);
        return;
      }
      if (typeof meProfile.city !== "string" || !meProfile.city.trim()) {
        console.warn(
          "[Discover audit] VIEWER_CITY_EMPTY — Coordonnées OK mais city vide (données profil incomplet pour l’affichage lieu).",
        );
      }

      let feedResult: Awaited<ReturnType<typeof fetchDiscoverFeedAlive>>;
      if (feedResultEarly) {
        feedResult = feedResultEarly;
      } else {
        try {
          feedResult = await fetchDiscoverFeedAlive(12, currentUserId);
        } catch (e) {
          console.warn("[Discover] loadProfiles feed fetch", e);
          throw e;
        }
      }
      if (feedResult.error && feedResult.rows.length === 0) {
        console.warn("[Discover feed] feed load failed", { message: feedResult.error });
        if (import.meta.env.DEV) {
          console.info("[Discover diagnostics] early_return", {
            stage: "get_discover_feed_alive",
            exclusion_reason: "feed RPC and feed_profiles fallback failed",
            error_message: feedResult.error,
          });
        }
        setErrorMessage(discoverFetchFailedMsg(language));
        setViewerGeoBlocked(false);
        setStableProfiles([]);
        setProfiles([]);
        setLoading(false);
        setFeedReady(true);
        return;
      }
      if (DISCOVER_PIPELINE_AUDIT) {
        console.log("[Discover pipeline] feed source", {
          source: feedResult.source,
          row_count: feedResult.rows.length,
        });
      }

      let profilesFromRpc: Profile[] = (feedResult.rows as DiscoverAliveRow[])
        .filter((row): row is DiscoverAliveRow & { profile: Profile } =>
          isValidProfileId(row.profile?.id),
        )
        .map((row) => ({
          ...row.profile,
          activity_label: row.activity_label,
          availability_label: row.availability_label,
          vibe_label: row.vibe_label,
          feed_reason: row.feed_reason,
        }))
        .filter((p) => hasFiniteDiscoverCoordinates(p));
      console.log("[Discover feed] raw profiles count (RPC, coords requis):", profilesFromRpc.length);
      if (import.meta.env.DEV) {
        console.info("[Discover diagnostics] candidate_counts", {
          stage: "before_filtering",
          count: profilesFromRpc.length,
        });
      }
      if (import.meta.env.DEV) {
        console.info("[Discover diagnostics] query_sources_used", {
          sources: ["get_discover_feed_alive (RPC)"],
          feed_profiles_ranked_note:
            "loadProfiles does not query feed_profiles nor feed_profiles_ranked; openProfileFromNavigation may probe feed_profiles_ranked for a single id.",
        });
        console.info("[Discover diagnostics] raw_candidates_fetched", {
          count: profilesFromRpc.length,
          ids: profilesFromRpc.map((r) => r.id),
          sample: profilesFromRpc.slice(0, 80).map((r) => ({ id: r.id, first_name: r.first_name })),
        });
        for (const name of ["Bruno", "Sofiane"] as const) {
          const hits = profilesFromRpc.filter(
            (r) =>
              typeof r.first_name === "string" &&
              new RegExp(`\\b${name}\\b`, "i").test(r.first_name.trim()),
          );
          if (hits.length > 0) {
            console.info(`[Discover diagnostics] raw_feed contains ${name}`, {
              rows: hits.map((r) => ({ id: r.id, first_name: r.first_name })),
            });
          }
        }
        console.info("[Discover diagnostics] rpc_already_swiped_note", {
          already_swiped:
            "Passes/serves prior swipes are applied inside get_discover_feed_alive on the server — not observable per-id in this client bundle.",
        });
      }

      let raw: Profile[] = profilesFromRpc.filter((p) => hasFiniteDiscoverCoordinates(p));
      if (!DISCOVER_BETA_SIMPLE_PIPELINE) {
        const before = raw;
        raw = raw.filter((p) => {
          const reasons = getDiscoverFeedIntegrityExclusionReasons(
            p as unknown as Record<string, unknown>,
          );
          return reasons.length === 0;
        });
        discoverDevPipelineDiff(before, raw, "exclude_ghost_inconsistent_profile", (p) => {
          const reasons = getDiscoverFeedIntegrityExclusionReasons(
            p as unknown as Record<string, unknown>,
          );
          return reasons.length > 0 ? reasons.join(";") : "missing required field";
        });
        discoverLogStageCount("after ghost/integrity filter", raw.length);
      }
      if (BETA_MODE && !DISCOVER_BETA_SIMPLE_PIPELINE) {
        const before = raw;
        raw = raw.filter((p) => {
          const st = String(p.photo_status ?? "").toLowerCase().trim();
          return st === "approved" || st === "pending";
        });
        discoverDevPipelineDiff(before, raw, "beta_approved_photo_only", discoverBetaPhotoRejectReason);
      }
      discoverLogStageCount("raw candidates fetched", profilesFromRpc.length);
      discoverLogStageCount("after RLS", raw.length, {
        note: "RLS is server-side in feed RPC/view; client gets post-RLS rows.",
      });
      if (import.meta.env.DEV) {
        const viewerGenderDiag = discoverCanonicalGender(meProfile.gender ?? null);
        const viewerLookingForDiag = discoverParseLookingFor(meProfile.looking_for ?? null);
        const afterGenderLookingFor = raw.filter((c) => {
          const cg = discoverCanonicalGender(c.gender ?? null);
          const cl = discoverParseLookingFor(c.looking_for ?? null);
          return (
            discoverLookingForAcceptsGender(viewerLookingForDiag, cg) &&
            discoverLookingForAcceptsGender(cl, viewerGenderDiag)
          );
        });
        discoverLogStageCount("after gender/looking_for filtering", afterGenderLookingFor.length, {
          diagnostic_only: true,
        });
        const afterBannedPhoto = raw.filter((c) => {
          const b = c as Profile & {
            is_banned?: boolean | null;
            status?: string | null;
            banned_until?: string | null;
          };
          const banned =
            b.is_banned === true ||
            String(b.status ?? "").trim().toLowerCase() === "banned" ||
            (typeof b.banned_until === "string" && b.banned_until.trim().length > 0 &&
              Number.isFinite(new Date(b.banned_until).getTime()) &&
              new Date(b.banned_until).getTime() > Date.now());
          const hasMain = typeof c.main_photo_url === "string" && c.main_photo_url.trim().length > 0;
          return !banned && hasMain;
        });
        discoverLogStageCount("after banned/photo filtering", afterBannedPhoto.length, {
          diagnostic_only: true,
          beta_pending_allowed: BETA_MODE,
        });
        discoverLogStageCount("relationship_mapping_verification", 2, {
          female_looking_for_men_matches_male_looking_for_female:
            discoverLookingForAcceptsGender(new Set(["male"]), "male") &&
            discoverLookingForAcceptsGender(new Set(["female"]), "female"),
          normalized_aliases: { men: discoverRelationshipToken("men"), women: discoverRelationshipToken("women") },
        });
      }
      console.log("[Discover detail] profils détaillés reçus", {
        count: raw.length,
        ids: raw.map((r) => r.id).filter(Boolean),
      });
      console.log("[Discover feed] profiles after completeness filter:", raw.length);
      const profilesAfterCompletenessFilter = [...raw];

      if (import.meta.env.DEV) {
        const loadedIds = new Set(raw.map((r) => r.id));
        console.debug("[Discover debug] profils rpc charges", {
          count: loadedIds.size,
          ids: [...loadedIds],
        });
      }

      const candidatesAfterQueryBeforeClientFilters = raw.length;

      const distById =
        raw.length > 0
          ? DISCOVER_BETA_SIMPLE_PIPELINE
            ? buildClientDiscoverDistanceById(meProfile, raw)
            : await fetchProfileDistancesOptional(raw.map((p) => p.id))
          : new Map<string, number | null>();

      {
        const before = raw;
        raw = raw.filter((p) => {
          if (!p?.id || !isValidProfileId(p.id)) return false;
          if (p.id === currentUserId) return false;
          if (!hasFiniteDiscoverCoordinates(p)) return false;
          return true;
        });
        discoverDevPipelineDiff(before, raw, "sanity_valid_id_not_self", (p) =>
          p.id === currentUserId ? "self" : "missing required field",
        );
        discoverLogStageCount("after self exclusion", raw.length);
      }
      if (likedIds.size > 0) {
        const before = raw;
        raw = raw.filter((p) => !likedIds.has(p.id));
        discoverDevPipelineDiff(before, raw, "exclude_outgoing_likes", () => "already liked");
        discoverPipelineStage("exclude_outgoing_likes", before.length, raw.length, {
          liked_set_size: likedIds.size,
        });
      }
      if (blockExclude.size > 0) {
        const before = raw;
        raw = raw.filter((p) => !blockExclude.has(p.id));
        discoverDevPipelineDiff(before, raw, "exclude_blocks", () => "blocked");
        discoverPipelineStage("exclude_blocks", before.length, raw.length, {
          blocked_set_size: blockExclude.size,
        });
      }
      if (matchedIds.size > 0) {
        const before = raw;
        raw = raw.filter((p) => !matchedIds.has(p.id));
        discoverDevPipelineDiff(before, raw, "exclude_matches", () => "already matched");
        discoverPipelineStage("exclude_matches", before.length, raw.length, {
          matched_set_size: matchedIds.size,
        });
      }
      discoverLogStageCount("after swipe exclusion", raw.length, {
        liked_set_size: likedIds.size,
        matched_set_size: matchedIds.size,
      });
      if (!DISCOVER_BETA_SIMPLE_PIPELINE) {
        const before = raw;
        raw = raw.filter((p) => !isProfileGhostActive(p.id));
        discoverDevPipelineDiff(before, raw, "exclude_ghost_boost_slot", () => "missing required field", "ghost_boost_active");
      }
      {
        const beforeVis = raw;
        const visibility = filterDiscoverVisibilityWindow(raw, hasPlus);
        raw = visibility.kept;
        if (!DISCOVER_BETA_SIMPLE_PIPELINE) {
          discoverDevPipelineDiff(
            beforeVis,
            raw,
            "discover_visibility_window",
            () => "missing required field",
            "discover_visibility_window",
          );
        } else if (visibility.betaWarnings > 0) {
          discoverLogStageCount("discover_visibility_window (beta warning-only)", raw.length, {
            would_exclude_without_beta: visibility.betaWarnings,
          });
        }
      }

      let stage: Profile[] = raw;
      console.log("[Discover feed] profiles before scoring filters:", stage.length);
      if (DISCOVER_PIPELINE_AUDIT && candidatesAfterQueryBeforeClientFilters > 0 && stage.length === 0) {
        console.warn("[Discover pipeline] all RPC candidates removed before scoring", {
          rpc_after_integrity: candidatesAfterQueryBeforeClientFilters,
          liked_set_size: likedIds.size,
          matched_set_size: matchedIds.size,
          blocked_set_size: blockExclude.size,
        });
      }
      let sharedPlaceById = new Map<string, boolean>();
      if (stage.length > 0 && !DISCOVER_BETA_SIMPLE_PIPELINE) {
        const { data: sharedRows, error: sharedErr } = await supabase.rpc("discover_shared_place_flags", {
          p_viewer_id: currentUserId,
          p_candidate_ids: stage.map((p) => p.id),
        });
        if (sharedErr && import.meta.env.DEV) {
          console.warn("[Discover feed] discover_shared_place_flags:", sharedErr.message);
        } else if (!sharedErr) {
          for (const row of (sharedRows ?? []) as { profile_id?: string; has_shared_place?: boolean }[]) {
            const pid = typeof row.profile_id === "string" ? row.profile_id : "";
            if (pid) sharedPlaceById.set(pid, row.has_shared_place === true);
          }
        }
      }

      if (stage.length > 0 && !DISCOVER_BETA_SIMPLE_PIPELINE) {
        const paceIds = stage.map((p) => p.id);
        const { data: paceData, error: paceErr } = await supabase
          .from("profiles")
          .select("id, sport_practice_type")
          .in("id", paceIds);
        if (paceErr) {
          if (import.meta.env.DEV) {
            console.warn("[Discover feed] sport_practice_type batch:", paceErr.message);
            console.info("[Discover diagnostics] sport_practice_batch", {
              error: paceErr.message,
              note: "RLS/no row — candidates may lack sport_practice_type merge.",
            });
          }
        } else {
          const paceById = new Map<string, string | null>();
          for (const row of (paceData ?? []) as { id?: string; sport_practice_type?: string | null }[]) {
            const pid = typeof row.id === "string" ? row.id : "";
            if (pid) paceById.set(pid, row.sport_practice_type ?? null);
          }
          stage = stage.map((p) => ({
            ...p,
            sport_practice_type: paceById.get(p.id) ?? p.sport_practice_type ?? null,
          }));
        }
      }

      if (stage.length > 0 && !DISCOVER_BETA_SIMPLE_PIPELINE) {
        const hydrationIds = stage.map((p) => p.id).filter(Boolean);
        const { data: hydrationRows, error: hydrationErr } = await supabase
          .from("profiles")
          .select(DISCOVER_CANDIDATE_HYDRATE_SELECT)
          .in("id", hydrationIds);
        if (hydrationErr) {
          console.warn("[Discover feed] candidate hydration batch:", hydrationErr.message);
        } else {
          const hydrationById = new Map<
            string,
            {
              birth_date?: string | null;
              preferred_age_min?: number | null;
              preferred_age_max?: number | null;
              gender?: string | null;
              looking_for?: string | null;
              intent?: string | null;
              profile_sports?: Profile["profile_sports"];
              sport_match_preference?: string | null;
              height_cm?: number | null;
            }
          >();
          for (const row of ((hydrationRows ?? []) as unknown[]) as Array<{
            id?: string;
            birth_date?: string | null;
            preferred_age_min?: unknown;
            preferred_age_max?: unknown;
            gender?: string | null;
            looking_for?: string | null;
            intent?: string | null;
            profile_sports?: unknown;
            height_cm?: unknown;
          }>) {
            const pid = typeof row.id === "string" ? row.id : "";
            if (!pid) continue;
            const normalizedProfileSports = Array.isArray(row.profile_sports)
              ? (row.profile_sports as Profile["profile_sports"])
              : [];
            const heightCmHydr = coerceProfileHeightCm(row.height_cm);
            hydrationById.set(pid, {
              birth_date: typeof row.birth_date === "string" ? row.birth_date : null,
              preferred_age_min:
                typeof row.preferred_age_min === "number" && Number.isFinite(row.preferred_age_min)
                  ? row.preferred_age_min
                  : null,
              preferred_age_max:
                typeof row.preferred_age_max === "number" && Number.isFinite(row.preferred_age_max)
                  ? row.preferred_age_max
                  : null,
              gender: row.gender ?? null,
              looking_for: row.looking_for ?? null,
              intent: row.intent ?? null,
              profile_sports: normalizedProfileSports,
              sport_match_preference:
                typeof (row as { sport_match_preference?: unknown }).sport_match_preference === "string"
                  ? String((row as { sport_match_preference?: string }).sport_match_preference)
                  : null,
              height_cm: heightCmHydr,
            });
          }
          stage = stage.map((p) => {
            const h = hydrationById.get(p.id);
            if (!h) {
              return {
                ...p,
                height_cm: coerceProfileHeightCm((p as { height_cm?: unknown }).height_cm),
              };
            }
            return {
              ...p,
              birth_date: h.birth_date ?? p.birth_date ?? null,
              preferred_age_min: h.preferred_age_min ?? (p as { preferred_age_min?: number | null }).preferred_age_min ?? null,
              preferred_age_max: h.preferred_age_max ?? (p as { preferred_age_max?: number | null }).preferred_age_max ?? null,
              gender: h.gender ?? p.gender ?? null,
              looking_for: h.looking_for ?? p.looking_for ?? null,
              intent: h.intent ?? p.intent ?? null,
              profile_sports: h.profile_sports ?? p.profile_sports ?? [],
              sport_match_preference: h.sport_match_preference ?? p.sport_match_preference ?? null,
              height_cm: h.height_cm,
            };
          });

          if (import.meta.env.DEV) {
            const rows = stage.map((p) => ({
              id: p.id,
              first_name: p.first_name ?? null,
              raw_db_gender: p.gender ?? null,
              normalized_gender: discoverCanonicalGender(p.gender ?? null),
              raw_db_looking_for: p.looking_for ?? null,
              normalized_looking_for: [...discoverParseLookingFor(p.looking_for ?? null)],
              loaded_profile_sports_ids: discoverExtractProfileSportIds(p),
            }));
            console.info("[Discover diagnostics] candidate_profile_hydration", {
              count: rows.length,
              rows,
            });
          }
        }
      }

      const sploveFlagsById = new Map<string, { boost: boolean; priority_meet: boolean }>();
      if (stage.length > 0 && !DISCOVER_BETA_SIMPLE_PIPELINE) {
        const { data: flagRows, error: flagErr } = await supabase.rpc(
          "discover_candidate_splove_ranking_flags",
          { p_candidate_ids: stage.map((p) => p.id) },
        );
        if (flagErr && import.meta.env.DEV) {
          console.warn("[Discover feed] discover_candidate_splove_ranking_flags:", flagErr.message);
        } else if (!flagErr) {
          for (const row of (flagRows ?? []) as {
            profile_id?: string;
            boost_active?: boolean;
            priority_meet_active?: boolean;
          }[]) {
            const pid = typeof row.profile_id === "string" ? row.profile_id : "";
            if (!pid) continue;
            sploveFlagsById.set(pid, {
              boost: row.boost_active === true,
              priority_meet: row.priority_meet_active === true,
            });
          }
        }
      }

      const viewerSportIdsForScoring = discoverExtractProfileSportIds(meProfile);
      logSportMatchPreferenceScoringTrace("viewer_before_scoring_ctx", meProfile.sport_match_preference);

      if (import.meta.env.DEV) {
        console.info("[Discover diagnostics] candidates_before_scoring_filters", {
          viewer_id: currentUserId,
          count: stage.length,
          candidates_after_query_before_pipeline: candidatesAfterQueryBeforeClientFilters,
          after_outgoing_likes_blocks_matches_swipe_pipeline: stage.length,
          outgoing_liked_target_count: likedIds.size,
          blocked_count: blockExclude.size,
          matched_exclude_count: matchedIds.size,
          ids: stage.map((p) => p.id),
          names: stage.map((p) => ({ id: p.id, first_name: p.first_name })),
        });
      }

      const discoverScoringCtx = {
        viewerId: currentUserId,
        viewer: {
          id: currentUserId,
          city: meProfile.city ?? null,
          latitude: meProfile.latitude ?? null,
          longitude: meProfile.longitude ?? null,
          portrait_url: meProfile.portrait_url ?? null,
          main_photo_url: meProfile.main_photo_url ?? null,
          profile_sports: meProfile.profile_sports ?? [],
          profile_completed: meProfile.profile_completed ?? null,
          birth_date:
            typeof meProfile.birth_date === "string" && meProfile.birth_date.trim().length > 0
              ? meProfile.birth_date.trim()
              : null,
          preferred_age_min: asAgePreferenceScalar(
            (meProfile as { preferred_age_min?: unknown }).preferred_age_min,
          ),
          preferred_age_max: asAgePreferenceScalar(
            (meProfile as { preferred_age_max?: unknown }).preferred_age_max,
          ),
          gender: meProfile.gender ?? null,
          looking_for: meProfile.looking_for ?? null,
          intent: meProfile.intent ?? null,
          sport_practice_type: meProfile.sport_practice_type ?? null,
          sport_time: meProfile.sport_time ?? null,
          discovery_radius_km: meProfile.discovery_radius_km ?? null,
          sport_match_preference: meProfile.sport_match_preference ?? null,
        },
        likedIds,
        matchedIds,
        blockedIds: blockExclude,
        mySportMatchKeys: sportsSet,
        viewerSportIds: viewerSportIdsForScoring,
        distanceById: distById,
        sploveFlagsById,
      };

      const scoringInput = stage.map((p) => ({
        ...p,
        has_shared_place: sharedPlaceById.get(p.id) === true,
      }));
      const scoringRun =
        scoringInput.length > 0
          ? runDiscoverScoring(scoringInput, discoverScoringCtx)
          : { kept: [], audits: [] };

      logProfileExcludedAudits(scoringRun.audits);

      let discoverFiltered: ProfileWithAffinity[] = scoringRun.kept.map((p) => ({
        ...p,
        reliabilityScore: computeReliabilityScore(p),
      }));

      if (
        !DISCOVER_BETA_SIMPLE_PIPELINE &&
        DISCOVER_SCORING_FALLBACK_AFTER_COMPLETENESS &&
        discoverFiltered.length === 0 &&
        profilesAfterCompletenessFilter.length > 0
      ) {
        const completenessScoringRun =
          profilesAfterCompletenessFilter.length === scoringInput.length &&
          profilesAfterCompletenessFilter.every((p, i) => p.id === scoringInput[i]?.id)
            ? scoringRun
            : runDiscoverScoring(
                profilesAfterCompletenessFilter.map((p) => ({
                  ...p,
                  has_shared_place: sharedPlaceById.get(p.id) === true,
                })),
                discoverScoringCtx,
              );

        if (completenessScoringRun !== scoringRun) {
          logProfileExcludedAudits(completenessScoringRun.audits);
        }

        const auditById = new Map(
          completenessScoringRun.audits.map((a) => [a.profile_id, a]),
        );

        console.warn("[Discover pipeline] TEMP fallback after-completeness (scoring returned 0)", {
          completeness_count: profilesAfterCompletenessFilter.length,
          stage_count: stage.length,
          scoring_kept: scoringRun.kept.length,
        });

        discoverFiltered = profilesAfterCompletenessFilter
          .filter((p) => p?.id && isValidProfileId(p.id) && p.id !== currentUserId)
          .map((p) => {
            const audit = auditById.get(p.id);
            const partialScore = audit?.discover_score ?? 0;
            return {
              ...p,
              has_shared_place: sharedPlaceById.get(p.id) === true,
              commonSportsCount: 0,
              discoverScore: partialScore,
              practice_score: audit?.practice_score ?? 0,
              distanceKm: distById.get(p.id) ?? null,
              discover_reasons: [
                "discover_debug_fallback_after_completeness",
                ...(audit?.reasons.length ? [`would_exclude:${audit.reasons.join(",")}`] : []),
              ],
              discover_excluded: false,
              reliabilityScore: computeReliabilityScore(p),
              is_boost_active: sploveFlagsById.get(p.id)?.boost === true,
            } satisfies ProfileWithAffinity;
          });
      }

      if (import.meta.env.DEV) {
        console.info("[Discover diagnostics] candidates_after_scoring_filters", {
          count: discoverFiltered.length,
          ids: discoverFiltered.map((p) => p.id),
          names: discoverFiltered.map((p) => ({ id: p.id, first_name: p.first_name })),
        });
      }
      discoverLogStageCount("after scoring", discoverFiltered.length);
      if (import.meta.env.DEV) {
        console.info("[Discover diagnostics] candidate_counts", {
          stage: "after_filtering",
          count: discoverFiltered.length,
        });
      }

      if (discoverFiltered.length > 0 && !DISCOVER_BETA_SIMPLE_PIPELINE) {
        const candidateIds = discoverFiltered.map((p) => p.id).filter(Boolean);
        const { data: engagementRows, error: engagementError } = await supabase
          .from("user_engagement")
          .select("user_id, reliability_label")
          .in("user_id", candidateIds);
        if (engagementError) {
          console.warn("[Discover] user_engagement fetch error:", engagementError.message ?? engagementError);
        } else {
          const labelById = new Map<string, string>();
          for (const row of (engagementRows ?? []) as {
            user_id?: string | null;
            reliability_label?: string | null;
          }[]) {
            const uid = typeof row.user_id === "string" ? row.user_id : "";
            if (!uid) continue;
            labelById.set(uid, row.reliability_label ?? "Medium");
          }
          for (let i = 0; i < discoverFiltered.length; i += 1) {
            const p = discoverFiltered[i];
            discoverFiltered[i] = { ...p, reliability_label: labelById.get(p.id) ?? "Medium" };
          }
        }
      }

      for (let i = 0; i < discoverFiltered.length; i += 1) {
        const p = discoverFiltered[i];
        const serverBoost = sploveFlagsById.get(p.id)?.boost === true;
        discoverFiltered[i] = {
          ...p,
          is_boost_active: serverBoost || isProfileBoostActive(p.id),
        };
      }

      discoverFiltered.sort((a, b) => sortDiscoverProfileStack(a, b, hasPlus));

      const discoverOrdered = discoverFiltered;

      if (import.meta.env.DEV && discoverFiltered.length > 0) {
        for (const p of discoverFiltered.slice(0, 12)) {
          console.debug("[Discover score V3]", p.first_name ?? p.id, {
            reliability: p.reliabilityScore,
            score: p.discoverScore,
            practice_score: p.practice_score,
            sharedSportsCount: p.commonSportsCount,
            distanceKm: p.distanceKm,
            reasons: p.discover_reasons,
          });
        }
      }

      const safe = discoverOrdered.filter(
        (p) => p?.id && isValidProfileId(p.id) && hasFiniteDiscoverCoordinates(p),
      );
      const slice = safe.slice(0, DISCOVER_DISPLAY_LIMIT);
      resultCount = slice.length;
      const viewerPrefTrace = logSportMatchPreferenceScoringTrace(
        "pipeline_counts_final",
        meProfile.sport_match_preference,
      );
      console.log("[Discover audit] pipeline_counts", {
        raw_merged_profiles: profilesFromRpc.length,
        after_client_pipeline: stage.length,
        after_scoring: discoverFiltered.length,
        final_ui_slice: slice.length,
        viewer_sport_match_preference_raw: viewerPrefTrace.raw_db,
        viewer_sport_match_preference_normalized: viewerPrefTrace.normalized,
        final_scoring_value: viewerPrefTrace.normalized,
        viewer_discover_radius_km: meProfile.discovery_radius_km ?? null,
      });
      console.log("[Discover feed] final profiles count:", resultCount);
      discoverLogStageCount("final rendered count", resultCount);
      if (import.meta.env.DEV) {
        console.info("[Discover diagnostics] summary_counts", {
          auth_user_id: currentUserId,
          raw_candidates_merged: profilesFromRpc.length,
          candidates_after_client_pipeline_before_scoring: stage.length,
          candidates_after_scoring_filters: discoverFiltered.length,
          final_ui_slice: slice.length,
        });
        if (resultCount === 0) {
          const stageName =
            profilesFromRpc.length === 0
              ? "raw candidates fetched"
              : stage.length === 0
                ? "after swipe exclusion"
                : discoverFiltered.length === 0
                  ? "after scoring"
                  : "final rendered count";
          const reason =
            profilesFromRpc.length === 0
              ? "no candidates returned by server feed / RLS"
              : stage.length === 0
                ? "all candidates excluded by client self/swipe/block/visibility filters"
                : discoverFiltered.length === 0
                  ? "all candidates excluded by scoring filters"
                  : "no cards left after final ordering/slice";
          console.info("[Discover diagnostics] empty_candidates", {
            viewer_id: currentUserId,
            stage: stageName,
            exclusion_reason: reason,
            counts: {
              raw_merged: profilesFromRpc.length,
              after_client_pipeline: stage.length,
              after_scoring: discoverFiltered.length,
              final_slice: slice.length,
            },
            incoming_like_note:
              "Outgoing likes use liker_id=viewer only; people who liked you are not excluded by the likes table.",
          });
        }
      }
      const profileViewState = await profileViewsOrderingPromise;
      profileViewOrderingRef.current = profileViewState;
      setProfileViewOrderTick((n) => n + 1);
      let commitProfiles = orderDiscoverProfilesByProfileViews(
        takeDiscoverProfilesWithValidGps(slice),
        profileViewState,
      );
      if (DISCOVER_BETA_SIMPLE_PIPELINE && commitProfiles.length > 0) {
        const [likedDeferred, matchedDeferred, blockDeferred] = await Promise.all([
          fetchOutgoingLikedUserIds(currentUserId),
          fetchMatchedUserIds(currentUserId),
          fetchBlockExclusionDetail(currentUserId),
        ]);
        commitProfiles = takeDiscoverProfilesWithValidGps(
          commitProfiles.filter(
            (p) =>
              !likedDeferred.has(p.id) &&
              !matchedDeferred.has(p.id) &&
              !blockDeferred.excluded.has(p.id),
          ),
        );
      }
      const shouldReapplyRotation = reapplyRotationOnNextCommitRef.current;
      reapplyRotationOnNextCommitRef.current = false;
      commitProfiles = applyMoveProfileRotationForFeedCommit(currentUserId, commitProfiles, {
        reapplyPendingReload: shouldReapplyRotation,
      });
      setStableProfiles(commitProfiles);
      setProfiles(commitProfiles);
      console.log("MOVE_FEED_READY", { count: commitProfiles.length });
      swipeHistoryRef.current = [];
      setSwipeHistory([]);
      setLoading(false);
      setFeedReady(true);
    } catch (e) {
      console.warn("[Discover] loadProfiles erreur inattendue:", e);
      console.log("MOVE_FEED_ERROR", {
        message: e instanceof Error ? e.message : String(e),
      });
      setViewerGeoBlocked(false);
      setStableProfiles([]);
      setProfiles([]);
      setErrorMessage(discoverFetchFailedMsg(language));
      setLoading(false);
      setFeedReady(true);
    } finally {
      loadProfilesInFlightRef.current = false;
      if (loadProfilesPendingReloadRef.current) {
        loadProfilesPendingReloadRef.current = false;
        reapplyRotationOnNextCommitRef.current = true;
        void loadProfiles().catch((e) => {
          console.warn("[Discover diagnostics] loadProfiles pending reload rejected", e);
        });
      }
    }
  }

  async function handlePass(profileId: string, decisionTimeMs = 0) {
    setDiscoverMenuProfileId(null);
    setSecondChanceTarget(null);
    setSecondChanceModalOpen(false);
    setPreviewProfile((prev) => (prev?.id === profileId ? null : prev));

    if (!isValidProfileId(profileId)) return;

    explicitSwipeProfileIdRef.current = profileId;
    if (currentUserId) {
      profileViewOrderingRef.current = applyLocalProfileViewActionTaken(
        profileViewOrderingRef.current,
        profileId,
      );
      setProfileViewOrderTick((n) => n + 1);
      void markProfileViewActionTaken(currentUserId, profileId);
    }

    const topCard = profilesCardStack[0];
    const p =
      (topCard?.id === profileId ? topCard : null) ??
      profiles.find((profileRow) => profileRow.id === profileId);
    if (!p) return;

    const profileCopy = JSON.parse(JSON.stringify(p)) as ProfileWithAffinity;
    undoStackRef.current.unshift(profileCopy);
    setUndoStackTick((n) => n + 1);
    console.log("[Discover] undoStack push", {
      id: profileCopy.id,
      first_name: profileCopy.first_name ?? null,
      stackSize: undoStackRef.current.length,
    });

    passedProfileIdsRef.current.add(profileId);
    setPassedFilterTick((n) => n + 1);

    patchDiscoverStackProfiles((prev) => prev.filter((profileRow) => profileRow.id !== profileId));
    setSwipeHistory((h) => {
      const next: DiscoverSwipeHistoryEntry[] = [...h, { profile: p, action: "pass" as const }];
      swipeHistoryRef.current = next;
      return next;
    });
    if (p.id === lastRestoredProfileId) {
      setLastRestoredProfileId(null);
    }

    if (!currentUserId) return;

    void (async () => {
      try {
        const { data: passRpcData, error: rpcErr } = await supabase.rpc("pass_profile", {
          p_passed_profile_id: profileId,
        });
        if (rpcErr) {
          console.warn("[Discover] pass_profile", rpcErr);
        } else {
          const passDeclined =
            passRpcData &&
            typeof passRpcData === "object" &&
            (passRpcData as { ok?: boolean }).ok === false;
          if (passDeclined) {
            console.warn("[Discover] pass_profile declined", passRpcData);
          }
        }
        const r = await recordDiscoverSwipe({
          targetId: profileId,
          action: "pass",
          decisionTimeMs,
          isMatch: false,
        });
        if (!r.ok) console.warn("[Discover] record pass swipe", r.error);
        refreshRewindStatus();
      } catch (e) {
        console.warn("[Discover] handlePass background", e);
      }
    })();
  }

  async function handleBlock(blockedUserId: string) {
    setDiscoverMenuProfileId(null);
    const blockerId = user?.id;
    if (!blockerId || !isValidProfileId(blockedUserId)) {
      setBlockActionError("Session ou profil invalide.");
      return;
    }
    if (!window.confirm(BLOCK_PROFILE_CONFIRM)) {
      return;
    }
    if (blockInFlightRef.current.has(blockedUserId)) return;
    blockInFlightRef.current.add(blockedUserId);
    setBlockActionError(null);
    const { error } = await supabase.from("blocks").insert({
      blocker_id: blockerId,
      blocked_id: blockedUserId,
    });
    blockInFlightRef.current.delete(blockedUserId);
    if (error) {
      const dup = (error as { code?: string }).code === "23505";
      if (!dup) {
        console.error("Error blocking profile:", error);
        setBlockActionError(error.message || "Blocage impossible. Réessayez.");
        return;
      }
    }
    patchDiscoverStackProfiles((prev) => prev.filter((p) => p.id !== blockedUserId));
    setPreviewProfile((prev) => (prev?.id === blockedUserId ? null : prev));
  }

  function handleViewProfileFromSuggestion(p: ProfileWithAffinity) {
    if (!isValidProfileId(p.id)) return;
    if (!hasFiniteDiscoverCoordinates(p)) return;
    setPreviewProfile(p);
  }

  const pendingMatchIntroVariant: MatchIntroVariant = useMemo(() => {
    if (!pendingMatchIntro || !currentUserId) return "generic";
    const myProfile = profile && typeof profile === "object" ? profile : null;
    return resolveMatchIntroVariant({
      myUserId: currentUserId,
      matchedByUserId: pendingMatchIntro.matchedByUserId,
      myGender: myProfile ? (myProfile as { gender?: string | null }).gender : null,
      myIntent: myProfile ? (myProfile as { intent?: unknown }).intent : null,
      partnerGender: pendingMatchIntro.partnerGender,
      partnerIntent: pendingMatchIntro.partnerIntent,
    });
  }, [pendingMatchIntro, currentUserId, profile]);

  function dismissMatchIntro(markSeen: boolean) {
    if (markSeen && pendingMatchIntro) {
      markMatchIntroSeen(pendingMatchIntro.conversationId);
    }
    setPendingMatchIntro(null);
  }

  function handleMatchIntroPrimary() {
    const p = pendingMatchIntro;
    if (!p) return;
    markMatchIntroSeen(p.conversationId);
    const openActivity = matchIntroPrimaryOpensActivity(pendingMatchIntroVariant);
    setPendingMatchIntro(null);
    navigate(`/chat/${p.conversationId}`, {
      state: {
        partnerFirstName: p.partnerFirstName,
        partnerMainPhotoUrl: p.partnerMainPhotoUrl,
        matchedByUserId: p.matchedByUserId,
        sharedSports: p.sharedSports,
        partnerSportPracticeType: p.partnerSportPracticeType,
        ...(openActivity ? { openActivityComposer: true } : {}),
      },
    });
  }

  async function handleLike(profile: ProfileWithAffinity, decisionTimeMs = 0) {
    if (!currentUserId) {
      console.error("[Discover] handleLike: no authenticated user");
      return;
    }
    if (!isValidProfileId(profile.id)) {
      setLikeActionError("Profil invalide pour le like.");
      return;
    }
    if (profile.id === currentUserId) {
      setLikeActionError(null);
      return;
    }
    if (likeInFlightRef.current.has(profile.id)) return;
    likeInFlightRef.current.add(profile.id);

    explicitSwipeProfileIdRef.current = profile.id;
    profileViewOrderingRef.current = applyLocalProfileViewActionTaken(
      profileViewOrderingRef.current,
      profile.id,
    );
    setProfileViewOrderTick((n) => n + 1);
    void markProfileViewActionTaken(currentUserId, profile.id);

    try {
      const blocked = await isBlockedWith(profile.id);
      if (blocked) {
        console.error("[Discover] like prevented: profil bloqué", { other: profile.id });
        setLikeActionError("Action impossible avec ce profil.");
        return;
      }

      const shared = getSharedSportLabelsForMatch(mySportMatchKeys, profile);

      let data: unknown;
      let rpcError: { message?: string } | null;
      try {
        setLikeActionError(null);
        const res = await supabase.rpc("create_like_and_get_result", {
          p_liked_id: profile.id,
        });
        data = res.data;
        rpcError = res.error;
      } catch (e) {
        console.error("[Discover] create_like_and_get_result RPC throw:", e);
        setLikeActionError(e instanceof Error ? e.message : "Erreur réseau");
        return;
      }

    const parsed = parseLikeRpcResult(data);
    let is_match = parsed?.is_match === true;
    let conversation_id = parsed?.conversation_id ?? null;

    if (is_match && !conversation_id) {
      conversation_id = await fetchConversationIdForUserPair(currentUserId, profile.id);
    }

    if (rpcError && (data === null || data === undefined)) {
      console.error("[Discover] create_like_and_get_result fatal (no data):", rpcError.message);
      const msg = rpcError.message ?? "";
      const blocked =
        msg.includes("bloqué") || msg.includes("P0001") || msg.toLowerCase().includes("blocked");
      setLikeActionError(blocked ? "Action impossible avec ce profil." : msg || "Erreur lors du like");
      return;
    }

    setLikeActionError(null);
    if (rpcError) {
      console.warn("[Discover] RPC warning (data present):", rpcError.message);
    }

    if (lastRestoredProfileId != null && profile.id === lastRestoredProfileId) {
      if (is_match === true) {
        void trackEvent({
          userId: user?.id ?? null,
          eventName: "match_after_undo",
          testName: SECOND_CHANCE_COPY_TEST,
          variant: getAbVariant(user?.id, SECOND_CHANCE_COPY_TEST),
          metadata: { matched_after_undo: true },
        });
      }
      setLastRestoredProfileId(null);
    }

    void recordDiscoverSwipe({
      targetId: profile.id,
      action: "like",
      decisionTimeMs,
      isMatch: is_match,
    }).then((swipeRec) => {
      if (!swipeRec.ok) console.warn("[Discover] record_discover_swipe", swipeRec.error);
      refreshRewindStatus();
    });

    setSwipeHistory((h) => {
      const next: DiscoverSwipeHistoryEntry[] = [...h, { profile, action: "like" as const }];
      swipeHistoryRef.current = next;
      return next;
    });

    const removeFromFeed = () => {
      patchDiscoverStackProfiles((prev) => prev.filter((p) => p.id !== profile.id));
    };

    if (is_match && conversation_id) {
      try {
        sessionStorage.setItem(`splove_conv_sports_${conversation_id}`, JSON.stringify(shared));
      } catch {
        /* quota */
      }
      removeFromFeed();
      if (!hasSeenMatchIntro(conversation_id)) {
        setPendingMatchIntro({
          conversationId: conversation_id,
          partnerFirstName: profile.first_name,
          partnerMainPhotoUrl: getProfileDisplayPhotoUrl(profile),
          partnerGender: profile.gender ?? null,
          partnerIntent: profile.intent ?? null,
          partnerSportPracticeType: profile.sport_practice_type ?? null,
          sharedSports: shared,
          matchedByUserId: currentUserId,
        });
        return;
      }
      navigate(`/match/${conversation_id}`, {
        replace: true,
        state: {
          partnerFirstName: profile.first_name,
          partnerMainPhotoUrl: getProfileDisplayPhotoUrl(profile),
          matchedByUserId: currentUserId,
          sharedSports: shared,
          partnerSportPracticeType: profile.sport_practice_type ?? null,
        },
      });
      return;
    }

    removeFromFeed();
    setLikeFeedbackMode(is_match ? "match" : "like");
    } finally {
      likeInFlightRef.current.delete(profile.id);
    }
  }

  const handlePreviewLike = async () => {
    if (!previewProfile) {
      if (import.meta.env.DEV) console.warn("[LIKE DEBUG] previewProfile missing");
      return;
    }

    setLikeActionError(null);

    if (import.meta.env.DEV) {
      console.log("[LIKE DEBUG]", {
        firstName: previewProfile.first_name,
        profileId: previewProfile.id,
        profileIdType: typeof previewProfile.id,
        previewProfile,
        payload: { p_liked_id: previewProfile.id },
      });
    }

    await handleLike(previewProfile, 0);
    setPreviewProfile(null);
  };

  function getUndoAccessState() {
    const stackSize = undoStackRef.current.length;
    const hasSploveUndoCredit = Boolean(currentUserId) && hasDiscoverUndoCredit(currentUserId);
    const hasLocalCredit = localUndoCredits > 0 || hasSploveUndoCredit;
    const hasUndoRight =
      hasLocalCredit ||
      profileUndoFlags.hasUndoFeature ||
      profileUndoFlags.profileUndoCredits > 0 ||
      profileUndoFlags.profileCanRewind ||
      profileUndoFlags.packSplovePlusIncludesUndo;
    const allowed =
      stackSize > 0 &&
      hasUndoRight;
    const reason = hasLocalCredit
      ? "local_credit"
      : profileUndoFlags.hasUndoFeature
        ? "has_undo_feature"
        : profileUndoFlags.profileUndoCredits > 0
          ? "profile_undo_credits"
          : profileUndoFlags.profileCanRewind
            ? "profile_can_rewind"
            : profileUndoFlags.packSplovePlusIncludesUndo
              ? "pack_splove_plus_includes_undo"
              : null;
    return { allowed, reason, hasLocalCredit, stackSize };
  }

  /** Retour (rewind) : pile locale d’abord ; seulement avec droit produit explicite. */
  async function handleUndoTap() {
    if (!currentUserId) return;
    const undoAccess = getUndoAccessState();
    const sploveCredits = getDiscoverUndoCreditCount(currentUserId);
    console.log("UNDO_CLICK", {
      stackSize: undoAccess.stackSize,
      localCredit: sploveCredits,
    });
    console.log("[Discover] undo state", {
      stackSize: undoAccess.stackSize,
      localCredit: sploveCredits,
      serverCanUndo: serverRewindAvailable,
    });
    if (!undoAccess.allowed) {
      console.log("UNDO_BLOCKED_NO_RIGHT", {
        stackSize: undoAccess.stackSize,
        hasPlus,
      });
      setRewindToast("Active Retour dans Splove+ pour revoir le dernier profil.");
      navigate("/splove-plus", { state: { sploveHighlightFeature: "undo_swipe_return" } });
      return;
    }

    console.log("UNDO_ALLOWED_REASON", { reason: undoAccess.reason });
    handleRewind({ consumeLocalCredit: undoAccess.hasLocalCredit });
  }

  async function loadCrossings() {
    if (!currentUserId) return;
    setCrossingsLoading(true);
    try {
      const rows = await fetchProfileCrossings();
      if (rows.length === 0) {
        setCrossingList([]);
        return;
      }
      const ids = rows.map((r) => r.target_id);
      const { data: profs } = await supabase.from("profiles").select("id, first_name").in("id", ids);
      const nameBy = new Map(
        (profs ?? []).map((p) => [p.id, (p as { first_name?: string | null }).first_name ?? null]),
      );
      setCrossingList(
        rows.map((r) => ({
          target_id: r.target_id,
          state: r.state,
          first_name: nameBy.get(r.target_id) ?? null,
        })),
      );
    } finally {
      setCrossingsLoading(false);
    }
  }

  function handleRewind(opts?: {
    consumeLocalCredit?: boolean;
  }) {
    if (!currentUserId) return;

    if (undoStackRef.current.length > 0) {
      const restored = undoStackRef.current.shift()!;
      setUndoStackTick((n) => n + 1);
      passedProfileIdsRef.current.delete(restored.id);
      setPassedFilterTick((n) => n + 1);
      profileViewOrderingRef.current = applyLocalProfileViewActionTaken(
        profileViewOrderingRef.current,
        restored.id,
      );
      setProfileViewOrderTick((n) => n + 1);
      setPreviewProfile(null);
      setDiscoverMenuProfileId(null);
      patchDiscoverStackProfiles((prev) => [restored, ...prev.filter((p) => p.id !== restored.id)]);
      setRewindRestoredId(restored.id);
      setRewindRestoredFrom("left");
      setRewindToast("Profil restaure");

      const swipeLast = swipeHistoryRef.current.at(-1);
      if (swipeLast?.profile.id === restored.id) {
        const nextHist = swipeHistoryRef.current.slice(0, -1);
        swipeHistoryRef.current = nextHist;
        setSwipeHistory(nextHist);
      }

      console.log("[Discover] undo restored local profile", {
        id: restored.id,
        first_name: restored.first_name ?? null,
      });
      if (opts?.consumeLocalCredit) {
        if (consumeDiscoverUndoCredit(currentUserId)) {
          setUndoCreditTick((n) => n + 1);
          syncLocalUndoCredits();
          console.log("UNDO_CREDIT_CONSUMED", { userId: currentUserId.slice(0, 8) });
        }
      }

      void (async () => {
        try {
          const res = await rewindLastDiscoverSwipe();
          if (!res.ok) {
            console.warn("[Discover] rewind_last_discover_swipe (background)", res.error);
          }
          refreshRewindStatus();
        } catch (e) {
          console.warn("[Discover] rewind background", e);
        }
      })();
      return;
    }
  }

  undoTapLatestRef.current = handleUndoTap;

  useEffect(() => {
    const onNativeUndo = () => {
      void undoTapLatestRef.current();
    };
    window.addEventListener("splove-native-nav-undo", onNativeUndo);
    return () => window.removeEventListener("splove-native-nav-undo", onNativeUndo);
  }, []);

  const onDiscoverShell =
    location.pathname === "/move" || location.pathname === "/discover" || location.pathname === "/";

  useEffect(() => {
    if (!onDiscoverShell || !currentUserId) return;
    syncLocalUndoCredits();
    setUndoCreditTick((n) => n + 1);
  }, [onDiscoverShell, currentUserId, location.key, syncLocalUndoCredits]);

  useEffect(() => {
    if (!onDiscoverShell || !currentUserId) {
      setDiscoverUndoNav(null);
      return;
    }
    const discoverReady = Boolean(feedReady && !errorMessage && !loading && !viewerGeoBlocked);
    setDiscoverUndoNav({
      undoAvailable: discoverReady && canUndo,
      undoNavTapEnabled: Boolean(discoverReady && (IS_BETA_UNDO_FREE || canUndo)),
      undoBadgeText: discoverReady && canUndo ? "1" : null,
      undoBusy: rewindBusy,
      triggerUndo: () => void undoTapLatestRef.current(),
    });
    return () => setDiscoverUndoNav(null);
  }, [
    onDiscoverShell,
    currentUserId,
    canUndo,
    undoStackTick,
    undoCreditTick,
    rewindBusy,
    feedReady,
    errorMessage,
    viewerGeoBlocked,
    loading,
    setDiscoverUndoNav,
  ]);

  if (!showDiscoverShell) {
    if (isMoveRoute && hasSessionUser) {
      /* session OAuth : coque Move sans attendre le profil */
    } else if (isColdStartSplashActive()) {
      return null;
    } else {
      return <PostLoginProfileSplash />;
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg font-sans">
      <main
        className={`mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-2 pt-1 sm:px-3 ${
          currentUserId && !errorMessage && !loading && !viewerGeoBlocked
            ? nativeBottomNav
              ? "pb-4"
              : "pb-24"
            : "pb-10"
        }`}
      >
        <section className="mb-2 shrink-0 px-0.5">
          <div className="flex items-start justify-center gap-2 text-center sm:gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[1.2rem] font-semibold leading-tight tracking-tight text-app-text sm:text-[1.35rem]">
                {t("discover.heroTitle")}
              </p>
              <p className="mx-auto mt-1 max-w-[22rem] text-[13px] leading-snug text-app-muted sm:text-[14px]">
                {t("discover.heroSubtitle")}
              </p>
            </div>
          </div>
          <details className="group mx-auto mt-2 max-w-[24rem] text-left [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer list-none rounded-2xl border border-app-border/90 bg-app-card/80 px-3 py-2.5 text-center text-[12px] font-semibold text-app-muted shadow-sm ring-1 ring-white/[0.04] transition hover:border-app-border hover:bg-app-border/30">
              <span className="inline-flex items-center justify-center gap-1.5">
                {t("discover.hero_details_toggle")}
                <span className="text-app-muted/80 transition group-open:rotate-180" aria-hidden>
                  ▾
                </span>
              </span>
            </summary>
            <div className="mt-3 space-y-3 text-center">
              <p className="mx-auto max-w-[22rem] text-[12px] font-medium italic leading-snug text-app-muted/90">
                {t("discover.heroTagline")}
              </p>
              {formatViewerRadiusLabel(myDiscoveryRadiusKm) ? (
                <p className="mx-auto max-w-[21rem] text-[11px] font-medium text-app-muted">
                  {formatViewerRadiusLabel(myDiscoveryRadiusKm)}
                </p>
              ) : null}
              {myCity ? (
                <p className="mx-auto max-w-[21rem] text-[11px] text-app-muted">
                  {t("discover.yourCityLine", { city: myCity })}
                </p>
              ) : null}
              {currentUserId ? (
                <div className="mx-auto w-full max-w-[21rem] rounded-2xl border border-[#E11D2E]/25 bg-gradient-to-br from-[#FF1E2D]/[0.07] to-app-card px-3 py-3 text-left shadow-md ring-1 ring-white/[0.05]">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-app-text/95">
                    {t("discover.meetModeHeading")}
                  </p>
                  <p className="mt-1.5 text-[12px] leading-snug text-app-text">
                    {viewerMeetActive ? t("discover.meetModeOnBody") : t("discover.meetModeOffBody")}
                  </p>
                  <Link
                    to="/profile"
                    className="mt-2 inline-block text-[12px] font-semibold text-app-accent underline decoration-app-accent/40 underline-offset-2"
                  >
                    {t("discover.meetModeProfileCta")}
                  </Link>
                </div>
              ) : null}
              {currentUserId ? (
                <DiscoverLocalImpactCard
                  invitesCount={localImpact.invitesCount}
                  successfulReferrals={localImpact.successfulReferrals}
                  boostCredits={localImpact.boostCredits}
                  loading={localImpactLoading}
                  onInviteClick={() => {
                    void trackReferralEvent("invite_click", {
                      variant: referralVariant,
                      source: "discover_local_impact",
                    });
                    setReferralModalOpen(true);
                  }}
                />
              ) : null}
              {currentUserId && !loading && !errorMessage && !viewerGeoBlocked && profilesCardStack.length <= 3 ? (
                <div className="mx-auto w-full max-w-[21rem] text-left">
                  <ReferralCard
                    variant={referralVariant}
                    onInvite={() => {
                      void trackReferralEvent("invite_click", {
                        variant: referralVariant,
                        source: "discover",
                      });
                      setReferralModalOpen(true);
                    }}
                  />
                </div>
              ) : null}
              {currentUserId ? (
                <div className="mx-auto flex max-w-[21rem] flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      console.log("SPLOVE_PLUS_ENTRY_CLICK", { source: "discover_options_bar" });
                      navigate("/splove-plus", { state: { sploveHighlightFeature: "undo_swipe_return" } });
                    }}
                    className="rounded-xl border border-app-border bg-app-bg px-3 py-2 text-[12px] font-semibold text-app-muted transition hover:bg-app-border"
                  >
                    SPLove+
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCrossingsOpen(true);
                      void loadCrossings();
                    }}
                    className="rounded-xl border border-app-border bg-app-bg px-3 py-2 text-[12px] font-semibold text-app-muted transition hover:bg-app-border"
                  >
                    {t("discover_crossings_open")}
                  </button>
                </div>
              ) : null}
              {rewindError ? (
                <p className="mx-auto max-w-[22rem] text-[12px] text-amber-100/90">{rewindError}</p>
              ) : null}
              {rewindStatus &&
              !IS_BETA_UNDO_FREE &&
              !rewindStatus.has_premium &&
              !rewindStatus.can_rewind &&
              (rewindStatus.reason === "time_window" || rewindStatus.reason === "rewind_rate") &&
              !rewindError ? (
                <p className="mx-auto max-w-[22rem] text-[12px] leading-snug text-app-muted">
                  {t("discover_rewind_err_upgrade")}
                </p>
              ) : null}
              {boostStats.isActive ? (
                <div className="mx-auto max-w-[21rem] rounded-xl border border-fuchsia-400/35 bg-fuchsia-500/10 px-3 py-2 text-[12px] font-medium text-fuchsia-100">
                  <p>
                    {language === "en"
                      ? `Boost active - ${boostStats.views} views`
                      : `Boost actif - ${boostStats.views} vues`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-fuchsia-200/90">
                    {language === "en"
                      ? "You're getting more visibility now"
                      : "Tu gagnes en visibilité maintenant"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-fuchsia-200/85">
                    {language === "en" ? "Time left:" : "Temps restant :"}{" "}
                    {Math.max(1, Math.ceil(boostStats.remainingTime / 60000))} min
                  </p>
                  {boostStats.lastMinuteGain > 0 ? (
                    <p className="mt-0.5 text-[11px] text-fuchsia-100/85">
                      {language === "en"
                        ? `+${boostStats.lastMinuteGain} views in the last minute`
                        : `+${boostStats.lastMinuteGain} vues sur la derniere minute`}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </details>
        </section>

        {showMoveSkeleton ? (
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label={t("loading")}
            className="flex min-h-0 flex-1 flex-col"
          >
            <MoveProfileSkeleton immersive />
          </div>
        ) : (
          <>
            {loadingTimedOut && (
              <div
                role="alert"
                className="mb-5 flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-app-border bg-white px-6 py-10 text-center shadow-sm"
              >
                <p className="text-lg font-semibold text-black">SPLove loading timeout</p>
                <p className="mt-2 max-w-[22rem] text-sm text-neutral-600">
                  Le chargement Discover a dépassé 8 secondes. Vérifiez les logs [STEP] dans Xcode.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setLoadingTimedOut(false);
                    setErrorMessage("");
                    void loadProfiles().catch((e) => console.warn("[Discover] loadProfiles retry", e));
                  }}
                  className="mt-5 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Retry
                </button>
              </div>
            )}

            {errorMessage && (
              <div
                role="alert"
                className="mb-5 rounded-2xl border border-app-border bg-app-card px-5 py-6 text-center shadow-sm ring-1 ring-white/[0.04]"
              >
                <p className="text-base font-semibold leading-snug text-app-text">{t("discovery_unavailable")}</p>
                <p className="mx-auto mt-2 max-w-[22rem] text-sm leading-relaxed text-app-muted">
                  {errorMessage}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage("");
                    void loadProfiles();
                  }}
                  className="mx-auto mt-5 block w-full max-w-xs rounded-xl px-4 py-3 text-[15px] font-bold shadow-md transition hover:opacity-95 active:scale-[0.99]"
                  style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
                >
                  {t("discover.retryExplore")}
                </button>
              </div>
            )}

            {likeFeedbackMode === "like" && (
              <div
                role="status"
                aria-live="polite"
                className="mb-2 shrink-0 rounded-2xl border border-emerald-500/25 bg-emerald-950/35 px-3 py-2.5 text-sm text-emerald-50 shadow-sm ring-1 ring-emerald-500/10"
              >
                <p className="text-[15px] font-bold leading-snug">{t("interest_sent")}</p>
                <p className="mt-1 text-[13px] leading-snug text-emerald-100/90">
                  {t("interest_sent_desc")}
                </p>
              </div>
            )}

            {likeFeedbackMode === "match" && (
              <div
                role="status"
                aria-live="polite"
                className="mb-2 shrink-0 rounded-2xl border border-app-border bg-app-card px-3 py-2.5 text-sm text-app-text shadow-sm ring-1 ring-white/[0.04]"
              >
                <p className="border-l-2 border-app-accent pl-3 text-[15px] font-bold leading-snug text-app-text">
                  Match
                </p>
                <p className="mt-1 text-[13px] font-medium leading-snug text-app-text">
                  Proposez une sortie ou un message court — l’essentiel est de passer au réel.
                </p>
              </div>
            )}

            {secondChanceTarget ? (
              <div className="mb-2 shrink-0">
                <SecondChancePassCard
                  title={t("second_chance_title")}
                  subtitle={t("second_chance_subtitle")}
                  ctaLabel={t("second_chance_cta")}
                  dismissLabel={t("second_chance_dismiss")}
                  onSendMessage={() => setSecondChanceModalOpen(true)}
                  onDismiss={() => {
                    setSecondChanceTarget(null);
                    setSecondChanceModalOpen(false);
                  }}
                />
              </div>
            ) : null}

            {secondChanceToast ? (
              <p className="mb-2 shrink-0 rounded-xl border border-emerald-500/25 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100/95">
                {secondChanceToast}
              </p>
            ) : null}

            {likeActionError && (
              <p className="mb-2 shrink-0 rounded-xl border border-amber-500/25 bg-amber-950/35 px-3 py-2 text-sm text-amber-100">
                {likeActionError}
              </p>
            )}

            {blockActionError && (
              <p className="mb-2 shrink-0 rounded-xl border border-amber-500/25 bg-amber-950/35 px-3 py-2 text-sm text-amber-100">
                {blockActionError}
              </p>
            )}

            {boostLifecycleMessage ? (
              <p className="mb-2 shrink-0 rounded-xl border border-fuchsia-400/30 bg-fuchsia-950/30 px-3 py-2 text-sm text-fuchsia-100">
                {boostLifecycleMessage}
              </p>
            ) : null}

            {feedReady && !errorMessage && (profilesCardStack.length === 0 || viewerGeoBlocked) ? (
              <div className="flex min-h-[min(50dvh,420px)] flex-1 items-center">
                <EmptyDiscoverState
                  variant={viewerGeoBlocked ? "viewer_geo" : "default"}
                  onRefresh={() => void loadProfiles()}
                />
              </div>
            ) : null}

            {canRenderFeedCards ? (
              <div
                className={
                  nativeBottomNav
                    ? "relative mt-1 flex min-h-0 max-h-[calc(100dvh-11.5rem)] flex-1 flex-col"
                    : "relative mt-1 flex min-h-[min(540px,calc(100dvh-10rem))] flex-1 flex-col"
                }
              >
                {profilesCardStack[2] ? (
                  <DiscoverStackSilhouette key={profilesCardStack[2].id} profile={profilesCardStack[2]} layer="back" />
                ) : null}
                {profilesCardStack[1] ? (
                  <DiscoverStackSilhouette key={profilesCardStack[1].id} profile={profilesCardStack[1]} layer="mid" />
                ) : null}
                {profilesCardStack[0] ? (
                  <div
                    key={profilesCardStack[0].id}
                    className="relative z-[24] flex min-h-0 flex-1 flex-col"
                    style={
                      rewindRestoredId === profilesCardStack[0].id
                        ? {
                            animation:
                              rewindRestoredFrom === "right"
                                ? "splove-rewind-in-right 260ms ease-out"
                                : "splove-rewind-in-left 260ms ease-out",
                          }
                        : undefined
                    }
                  >
                    <DiscoverSwipeCard
                      profile={profilesCardStack[0]}
                      viewerCity={myCity}
                      mySportMatchKeys={mySportMatchKeys}
                      discoverMenuProfileId={discoverMenuProfileId}
                      setDiscoverMenuProfileId={setDiscoverMenuProfileId}
                      onPass={handlePass}
                      onLike={handleLike}
                      onOpenDetail={handleViewProfileFromSuggestion}
                      onReport={setReportProfileId}
                      onReportPhoto={openReportPhotoFromDiscover}
                      onBlock={handleBlock}
                      restoredProfileId={restoredProfileId}
                      immersive
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}

      </main>

      {crossingsOpen && !showMoveSkeleton ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 px-3 pb-0 pt-10 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={t("discover_crossings_title")}
          onMouseDown={() => setCrossingsOpen(false)}
        >
          <div
            className="mb-safe max-h-[min(80vh,520px)] w-full max-w-md overflow-y-auto rounded-t-3xl border border-app-border bg-app-card p-4 shadow-2xl sm:rounded-3xl"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-center text-base font-bold text-app-text">{t("discover_crossings_title")}</h2>
            <p className="mt-1 text-center text-[12px] text-app-muted">{t("discover_crossings_hint")}</p>
            {crossingsLoading ? (
              <p className="mt-4 text-center text-sm text-app-muted">{t("loading")}</p>
            ) : crossingList.length === 0 ? (
              <p className="mt-4 text-center text-sm text-app-muted">{t("discover_crossings_empty")}</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {crossingList.map((row) => (
                  <li key={row.target_id}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!isValidProfileId(row.target_id) || !currentUserId) return;
                        setCrossingsOpen(false);
                        const me = profile as Profile | null;
                        if (!me?.id) return;
                        const enriched = await buildAffinityProfileForRewind({
                          currentUserId,
                          targetId: row.target_id,
                          meProfile: me,
                          mySportMatchKeys,
                        });
                        if (enriched) {
                          setDiscoverMenuProfileId(null);
                          setPreviewProfile(enriched);
                        }
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-app-border bg-app-bg px-3 py-2.5 text-left text-sm text-app-text transition hover:bg-app-border"
                    >
                      <span className="font-semibold">{row.first_name?.trim() || "…"}</span>
                      <span className="text-[11px] text-app-muted">
                        {row.state === "liked"
                          ? t("discover_crossing_liked")
                          : row.state === "passed"
                            ? t("discover_crossing_passed")
                            : t("discover_crossing_seen")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setCrossingsOpen(false)}
              className="mt-4 w-full rounded-xl border border-app-border py-2.5 text-sm font-semibold text-app-text"
            >
              {t("close")}
            </button>
          </div>
        </div>
      ) : null}

      {!showMoveSkeleton && previewProfile ? (
        <DiscoverProfileDetailPreview
          profile={previewProfile}
          mySportMatchKeys={mySportMatchKeys}
          myCity={myCity}
          discoverMenuProfileId={discoverMenuProfileId}
          setDiscoverMenuProfileId={setDiscoverMenuProfileId}
          onBackdropClick={closePreviewModal}
          onBlock={handleBlock}
          onReportPhoto={openReportPhotoFromDiscover}
          onPreviewLike={handlePreviewLike}
          onPass={(id) => {
            handlePass(id, 0);
            setPreviewProfile(null);
          }}
          onClose={closePreviewModal}
          t={t}
        />
      ) : null}

      {!showMoveSkeleton && reportProfileId && currentUserId && (
        <ReportModal
          reportedProfileId={reportProfileId}
          reporterId={currentUserId}
          onClose={() => setReportProfileId(null)}
        />
      )}

      {!showMoveSkeleton && reportPhotoTarget && currentUserId && (
        <ReportPhotoModal
          reportedUserId={reportPhotoTarget.profileId}
          reporterUserId={currentUserId}
          portraitUrl={reportPhotoTarget.portraitUrl}
          fullbodyUrl={reportPhotoTarget.fullbodyUrl}
          onClose={() => setReportPhotoTarget(null)}
        />
      )}

      <ReferralModal
        open={referralModalOpen}
        onClose={() => setReferralModalOpen(false)}
        referralCode={referralCodeState}
        variant={referralVariant}
      />

      <MatchIntroModal
        open={pendingMatchIntro != null}
        variant={pendingMatchIntroVariant}
        onClose={() => dismissMatchIntro(true)}
        onPrimary={handleMatchIntroPrimary}
        onSecondary={() => dismissMatchIntro(true)}
      />

      <SecondChanceMessageModal
        open={secondChanceModalOpen && secondChanceTarget != null}
        recipientFirstName={secondChanceTarget?.first_name?.trim() || t("unnamed_profile")}
        title={t("second_chance_modal_title")}
        placeholder={t("second_chance_placeholder")}
        submitLabel={t("second_chance_submit")}
        cancelLabel={t("second_chance_cancel")}
        errInvalid={t("second_chance_err_invalid")}
        errGeneric={t("second_chance_err_generic")}
        hintNoLinks={t("second_chance_hint_no_links")}
        creditHint={t("second_chance_hint_credit")}
        onClose={() => setSecondChanceModalOpen(false)}
        onSubmit={async (message) => {
          if (!secondChanceTarget) return;
          const res = await createSecondChanceRequest(secondChanceTarget.id, message);
          if (!res.ok) {
            throw new Error(mapSecondChanceCreateErr(String(res.error ?? "")));
          }
          setSecondChanceModalOpen(false);
          setSecondChanceTarget(null);
          setSecondChanceToast(t("second_chance_sent"));
          void refetchProfile();
        }}
      />

      {rewindToast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[92] flex justify-center px-4">
          <div className="rounded-xl border border-app-border bg-app-card px-4 py-2 text-sm font-semibold text-app-text shadow-lg">
            {rewindToast}
          </div>
        </div>
      ) : null}

      <style>{`
        @keyframes splove-rewind-in-left {
          from { opacity: 0; transform: translateX(-22px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes splove-rewind-in-right {
          from { opacity: 0; transform: translateX(22px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
