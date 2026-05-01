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
import { ReportModal } from "../components/ReportModal";
import { ReportPhotoModal } from "../components/ReportPhotoModal";
import { PremiumSuggestionsSection } from "../components/PremiumSuggestionsSection";
import { BLOCK_PROFILE_CONFIRM, BLOCK_PROFILE_LINK_LABEL } from "../constants/copy";

import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import {
  IconBanSoft,
  IconHeartOutline,
  IconPass,
  IconProfileAvatarPlaceholder,
} from "../components/ui/Icon";
import { BETA_MODE } from "../constants/beta";
import { parseProfileIntent } from "../lib/profileIntent";
import { fetchBlockExclusionDetail, isBlockedWith } from "../services/blocks.service";
import { VerifiedBadge } from "../components/VerifiedBadge";
import { isPhotoVerified } from "../lib/profileVerification";
import {
  collectSportMatchKeysFromProfile,
  getDiscoverSportChips,
  getSharedSportLabelsForMatch,
} from "../lib/sportMatchGroups";
import {
  filterDiscoverReasonsForDisplay,
  guidedProfileSentence,
  intentLabelShort,
  softAreaHint,
} from "../lib/discoverCardCopy";
import {
  buildDiscoverScore,
  computeDiscoverMatchScoreBreakdown,
  computeReliabilityScore,
  getReliabilityUiHints,
} from "../lib/discoverScore";
import { scoreAndFilterDiscoverCandidates } from "../services/discoverScoring.service";
import { buildDiscoverLocationLines, formatViewerRadiusLabel } from "../utils/geolocation";
import { hasSharedPlace } from "../lib/sharedPlaceTeaser";
import { isProfileActiveRecently } from "../services/splovePlus.service";
import { usePremium } from "../hooks/usePremium";
import { useSplovePlus } from "../hooks/useSplovePlus";
import { useTranslation } from "../i18n/useTranslation";
import { useProfilePhotoSignedUrl } from "../hooks/useProfilePhotoSignedUrl";
import { DiscoverProfileCard } from "../components/discover/DiscoverProfileCard";
import { EmptyDiscoverState } from "../components/discover/EmptyDiscoverState";
import { ProfilePhotoViewerModal } from "../components/ProfilePhotoViewerModal";
import { DiscoverRewindButton } from "../components/DiscoverRewindButton";
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
import { practiceCompatibilityScore } from "../lib/sportPracticeCompatibilityScore";
import ReferralCard from "../components/referral/ReferralCard";
import ReferralModal from "../components/referral/ReferralModal";
import { DiscoverLocalImpactCard } from "../components/discover/DiscoverLocalImpactCard";
import {
  getOrCreateReferralCode,
  getReferralVariant,
  trackReferralEvent,
} from "../lib/referral";
import {
  countReferralsAsReferrer,
  countReferralsRowsByReferrer,
  fetchGrowthProfileFields,
} from "../services/referral.service";
import { trackEvent, getAbVariant, SECOND_CHANCE_COPY_TEST } from "../lib/analytics";

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
  sport_phrase?: string | null;
  sport_time?: string | null;
  /** Voir `profiles.is_photo_verified` (Veriff). */
  is_photo_verified?: boolean | null;
  /** Badge « vérifié » : `photo_status === 'approved'` (MVP). */
  photo_status?: string | null;
  needs_adapted_activities?: boolean | null;
  /** Rythme de pratique affiché sur Discover : solo | adapted | flexible */
  sport_practice_type?: string | null;
  profile_sports?: { sports: { label: string | null; slug?: string | null } | null }[];
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
  for (const u of [p.main_photo_url, p.portrait_url, p.avatar_url, p.fullbody_url]) {
    const t = typeof u === "string" ? u.trim() : "";
    if (t) return t;
  }
  return null;
}

/** Deuxième visuel pour l’aperçu (évite le doublon de la photo principale). */
function getSecondaryPhotoUrl(p: Profile): string | null {
  const main = getProfileDisplayPhotoUrl(p);
  for (const u of [p.fullbody_url, p.portrait_url, p.main_photo_url, p.avatar_url]) {
    const t = typeof u === "string" ? u.trim() : "";
    if (t && t !== main) return t;
  }
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
  const photoMain = useProfilePhotoSignedUrl(photoMainRaw) ?? "";
  const photoSecond = useProfilePhotoSignedUrl(photoSecondRaw) ?? "";
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
  function openPhotoViewerFromRaw(raw: string | null) {
    if (raw == null) return;
    const i = galleryRawRefs.indexOf(raw);
    setPhotoViewerInitial(i >= 0 ? i : 0);
    setPhotoViewerOpen(true);
  }
  return (
    <>
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="discover-preview-title"
        className="w-full max-w-md overflow-hidden rounded-3xl bg-app-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid h-44 grid-cols-2 gap-0.5 bg-app-border sm:h-52">
          <div className="relative min-h-0 bg-app-border">
            {photoMain ? (
              <img
                src={photoMain}
                alt={profile.first_name ? `Photo de ${profile.first_name}` : "Photo du profil"}
                className="absolute inset-0 h-full w-full cursor-pointer object-cover"
                onClick={(e) => {
                  e.stopPropagation();
                  openPhotoViewerFromRaw(photoMainRaw);
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-app-border">
                <IconProfileAvatarPlaceholder className="text-app-muted/80" size={56} />
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
        <div className="space-y-2.5 overflow-hidden px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="discover-preview-title" className="text-lg font-bold leading-tight text-app-text">
              {profile.first_name ?? t("unnamed_profile")}
              {age != null ? <span className="font-semibold text-app-muted">, {age}</span> : null}
            </h2>
            {intentPreview ? (
              <span className="rounded-full bg-app-border/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-app-text ring-1 ring-app-border">
                {intentPreview}
              </span>
            ) : null}
            {hasSharedPlace(profile) ? (
              <span className="rounded-full bg-app-card px-2 py-0.5 text-[10px] font-semibold tracking-wide text-app-text ring-1 ring-amber-200/60">
                📍 Lieu commun
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
            {isPhotoVerified(profile) ? <VerifiedBadge variant="compact" /> : null}
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
          <button
            type="button"
            className="mt-1 w-full rounded-2xl py-4 text-base font-bold shadow-lg transition hover:opacity-95 sm:py-4 sm:text-[17px]"
            style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
            onClick={() => void onPreviewLike()}
          >
            {t("propose_activity")}
          </button>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
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

function isIntentCompatibleForBoost(viewerIntentRaw: string | null | undefined, candidateIntentRaw: string | null | undefined): boolean {
  const viewerIntent = parseProfileIntent(viewerIntentRaw);
  const candidateIntent = parseProfileIntent(candidateIntentRaw);
  if (viewerIntent && candidateIntent) return viewerIntent === candidateIntent;
  const rawViewer = String(viewerIntentRaw ?? "").trim().toLowerCase();
  const rawCandidate = String(candidateIntentRaw ?? "").trim().toLowerCase();
  const viewerBoth = rawViewer === "both" || rawViewer === "les deux";
  const candidateBoth = rawCandidate === "both" || rawCandidate === "les deux";
  if (viewerBoth || candidateBoth) return true;
  return false;
}

function computeBoostRankingScore(
  profile: ProfileWithAffinity,
  viewerIntentRaw: string | null | undefined,
): number {
  const baseScore = Number.isFinite(profile.discoverScore) ? profile.discoverScore : 0;
  const boostBonus = profile.is_boost_active === true ? 300 : 0;
  const sportsBonus = profile.commonSportsCount > 0 ? 100 : 0;
  const intentBonus = isIntentCompatibleForBoost(viewerIntentRaw, profile.intent) ? 80 : 0;
  const activityBonus = isProfileActiveRecently(profile.last_active_at) ? 40 : 0;
  return baseScore + boostBonus + sportsBonus + intentBonus + activityBonus;
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

async function fetchConversationIdForPair(userA: string, userB: string): Promise<string | null> {
  const { data: row1 } = await supabase
    .from("matches")
    .select("conversation_id")
    .eq("user_a", userA)
    .eq("user_b", userB)
    .maybeSingle();
  const c1 = (row1 as { conversation_id?: string | null } | null)?.conversation_id;
  if (c1) return c1;
  const { data: row2 } = await supabase
    .from("matches")
    .select("conversation_id")
    .eq("user_a", userB)
    .eq("user_b", userA)
    .maybeSingle();
  return (row2 as { conversation_id?: string | null } | null)?.conversation_id ?? null;
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

const DISCOVER_DISPLAY_LIMIT = 10;
/** Source Supabase du fil Discover (classement serveur) — repli côté client si colonne absente. */
const DISCOVER_FEED_SOURCE = "feed_profiles_ranked" as const;

/** Message utilisateur sûr (aucun détail technique backend). */
function discoverFetchFailedMsg(language: "fr" | "en"): string {
  return language === "en"
    ? "Unable to load profiles. Check your connection and try again."
    : "Impossible de charger les profils. Verifie ta connexion et reessaie.";
}

function DiscoverProfileCardSkeleton() {
  return (
    <article
      className="mb-7 flex max-h-[min(92vh,840px)] min-h-[min(560px,88svh)] flex-col overflow-hidden rounded-3xl bg-app-card shadow-lg ring-1 ring-app-border/90"
      aria-hidden
    >
      <div className="relative min-h-[min(58vh,420px)] w-full flex-1 basis-0 overflow-hidden bg-zinc-950 sm:min-h-[min(52vh,480px)]">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/95 via-zinc-700/45 to-zinc-900/95 animate-pulse" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[10] pb-28 pt-12">
          <div className="flex flex-wrap gap-1.5 px-4">
            <div className="h-5 w-[4.25rem] rounded-full bg-white/12" />
            <div className="h-5 w-[5.5rem] rounded-full bg-white/10" />
          </div>
          <div className="mt-3 space-y-2 px-4">
            <div className="h-10 w-[65%] max-w-[13rem] rounded-lg bg-white/14" />
            <div className="h-4 w-[72%] max-w-[14rem] rounded-md bg-emerald-400/25" />
            <div className="h-3.5 w-[88%] max-w-[18rem] rounded-md bg-white/10" />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[11] flex items-center justify-between px-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="h-14 w-14 shrink-0 rounded-full bg-white/12 animate-pulse" />
          <div className="h-12 w-12 shrink-0 rounded-full bg-white/10 animate-pulse" />
          <div className="h-[3.65rem] w-[3.65rem] shrink-0 rounded-full bg-white/14 animate-pulse" />
        </div>
      </div>
      <div className="border-t border-app-border/85 bg-app-card px-3 py-2.5">
        <div className="mx-auto h-3 w-28 rounded-md bg-app-border/80 animate-pulse" />
      </div>
    </article>
  );
}

const SWIPE_COMMIT_PX = 72;
const TAP_MAX_PX = 15;
const SWIPE_DAMP = 0.55;
const DISCOVER_FREE_VISIBILITY_HOURS = 24;
const DISCOVER_PREMIUM_VISIBILITY_HOURS = 72;

function isWithinVisibilityWindow(createdAt: string | null | undefined, isPremium: boolean): boolean {
  const raw = typeof createdAt === "string" ? createdAt.trim() : "";
  if (!raw) return false;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return false;
  const maxHours = isPremium ? DISCOVER_PREMIUM_VISIBILITY_HOURS : DISCOVER_FREE_VISIBILITY_HOURS;
  return Date.now() - ts <= maxHours * 60 * 60 * 1000;
}

/**
 * Colonnes Discover depuis `public.profiles` uniquement — pas de colonnes optionnelles absentes en prod.
 * Badge « vérifié » : uniquement `photo_status === 'approved'`.
 */
const DISCOVER_PROFILES_DETAIL_SELECT =
  "id, first_name, birth_date, created_at, updated_at, last_active_at, gender, looking_for, intent, sport_feeling, sport_phrase, sport_time, portrait_url, fullbody_url, avatar_url, main_photo_url, city, profile_completed, is_photo_verified, photo_status, needs_adapted_activities, is_active_mode, sport_practice_type, profile_sports(sports(label, slug))";

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
  const { data: distRes } = await supabase.rpc("profile_distances_from_viewer", {
    p_candidate_ids: [input.targetId],
  });
  let distanceKm: number | null = null;
  for (const row of (distRes ?? []) as { profile_id?: string; distance_km?: number | null }[]) {
    if (row.profile_id === input.targetId) {
      distanceKm = row.distance_km ?? null;
      break;
    }
  }
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
  handleUndo: () => void;
  canUndo: boolean;
  restoredProfileId: string | null;
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
  handleUndo,
  canUndo,
  restoredProfileId,
}: DiscoverSwipeCardProps) {
  const photoRaw = getProfileDisplayPhotoUrl(profile);
  const photo = useProfilePhotoSignedUrl(photoRaw) ?? "";
  const strongAffinity = profile.commonSportsCount >= 2;

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

  const rot = Math.max(-4, Math.min(4, dx / 95));
  const liftOpacity = 1 - Math.min(Math.abs(dx) / 320, 0.1);

  return (
    <article
      className={`mb-7 flex max-h-[min(92vh,840px)] min-h-[min(560px,88svh)] flex-col overflow-hidden rounded-3xl bg-app-card shadow-lg ring-1 ring-app-border/90 ${
        strongAffinity ? "ring-2 ring-emerald-200/70" : ""
      } ${
        profile.is_boost_active
          ? "ring-2 ring-fuchsia-400/45 shadow-[0_0_22px_rgba(217,70,239,0.22)] animate-[pulse_2.8s_ease-in-out_infinite]"
          : ""
      }`}
    >
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
        onUndo={handleUndo}
        canUndo={canUndo}
        onReport={() => onReport(profile.id)}
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
  const handledPreviewNavKeyRef = useRef<string | null>(null);
  const { user, session, isLoading: authLoading, profile, isProfileLoading, refetchProfile } = useAuth();
  const viewerMeetActive =
    Boolean(profile) &&
    (profile as { is_active_mode?: boolean | null }).is_active_mode === true;
  const currentUserId = user?.id ?? "";
  const { hasPlus } = usePremium(currentUserId || null);
  const [profiles, setProfiles] = useState<ProfileWithAffinity[]>([]);
  const [mySportMatchKeys, setMySportMatchKeys] = useState<Set<string>>(new Set());
  const [myCity] = useState<string | null>(null);
  const [myDiscoveryRadiusKm] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
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
  const [rewindBusy, setRewindBusy] = useState(false);
  const [rewindError, setRewindError] = useState<string | null>(null);
  const [rewindToast, setRewindToast] = useState<string | null>(null);
  const [rewindRestoredId, setRewindRestoredId] = useState<string | null>(null);
  const [rewindRestoredFrom, setRewindRestoredFrom] = useState<"left" | "right">("left");
  const [restoredProfileId, setRestoredProfileId] = useState<string | null>(null);
  const [lastRestoredProfileId, setLastRestoredProfileId] = useState<string | null>(null);
  const [swipeHistory, setSwipeHistory] = useState<DiscoverSwipeHistoryEntry[]>([]);
  const swipeHistoryRef = useRef<DiscoverSwipeHistoryEntry[]>([]);
  const [secondChanceTarget, setSecondChanceTarget] = useState<ProfileWithAffinity | null>(null);
  const [secondChanceModalOpen, setSecondChanceModalOpen] = useState(false);
  const [secondChanceToast, setSecondChanceToast] = useState<string | null>(null);
  useEffect(() => {
    swipeHistoryRef.current = swipeHistory;
  }, [swipeHistory]);

  /** Dernière interaction annulable côté serveur uniquement après un pass (pas un like). */
  const canUndo = useMemo(() => {
    if (!rewindStatus) return false;
    if (rewindStatus.last_is_match) return false;
    if (!rewindStatus.last_swipe_at) return false;
    return String(rewindStatus.last_action ?? "").toLowerCase() === "pass";
  }, [rewindStatus]);
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
    void getDiscoverRewindStatus().then(setRewindStatus);
  }, []);

  useEffect(() => {
    console.log("[Discover] session", session);
    console.log("[Discover] profile", profile);
    console.log("[Discover] isProfileLoading", isProfileLoading);
  }, [session, profile, isProfileLoading]);

  useEffect(() => {
    if (!currentUserId) return;
    void refreshRewindStatus();
  }, [currentUserId, refreshRewindStatus]);

  useEffect(() => {
    inviteViewTrackedRef.current = false;
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    void getOrCreateReferralCode(currentUserId, profile?.first_name ?? null).then((c) => {
      if (!cancelled) setReferralCodeState(c);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUserId, profile?.first_name]);

  useEffect(() => {
    if (!currentUserId) return;
    void loadLocalImpact();
  }, [currentUserId, loadLocalImpact]);

  useEffect(() => {
    if (referralModalWasOpenRef.current && !referralModalOpen && currentUserId) {
      void loadLocalImpact();
    }
    referralModalWasOpenRef.current = referralModalOpen;
  }, [referralModalOpen, currentUserId, loadLocalImpact]);

  useEffect(() => {
    const eligible =
      Boolean(currentUserId) && !loading && !errorMessage && profiles.length <= 3;
    if (!eligible || inviteViewTrackedRef.current) return;
    inviteViewTrackedRef.current = true;
    void trackReferralEvent("invite_view", { variant: referralVariant, source: "discover" });
  }, [currentUserId, loading, errorMessage, profiles.length, referralVariant]);

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
      setDiscoverMenuProfileId(null);
      setPreviewProfile(fromFeed);
      console.log("DISCOVER_SELECTED_PROFILE", fromFeed.id);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [meRes, candRes, distRes] = await Promise.all([
          supabase
            .from("profiles")
            .select(
              "city, latitude, longitude, discovery_radius_km, gender, looking_for, intent, needs_adapted_activities, sport_practice_type, profile_sports(sports(label, slug))",
            )
            .eq("id", currentUserId)
            .maybeSingle(),
          supabase.from("profiles").select(DISCOVER_PROFILES_DETAIL_SELECT).eq("id", requestedProfileId).maybeSingle(),
          supabase.rpc("profile_distances_from_viewer", { p_candidate_ids: [requestedProfileId] }),
        ]);
        if (cancelled) return;

        const meProfile = (meRes.data as unknown as Profile) ?? { profile_sports: [] };
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

        const sportsSet = collectSportMatchKeysFromProfile(meProfile);
        let distanceKm: number | null = null;
        for (const row of (distRes.data ?? []) as { profile_id?: string; distance_km?: number | null }[]) {
          if (row.profile_id === requestedProfileId) {
            distanceKm = row.distance_km ?? null;
            break;
          }
        }

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
  }, [location.state, location.key, currentUserId, profiles]);

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

  useEffect(() => {
    if (authLoading) {
      console.debug("[Discover debug] authLoading=true — attente AuthContext");
      return;
    }
    if (!user?.id) {
      console.error("[Discover debug] BLOCKER: pas de user.id après auth — loading forcé à false", {
        authLoading,
        hasUser: Boolean(user),
      });
      setLoading(false);
      setErrorMessage((prev) => prev || "Impossible de charger votre session. Reconnectez-vous.");
      return;
    }
    console.debug("[Discover debug] lancement loadProfiles", {
      currentUserId: user.id,
      profile_completed: profile?.profile_completed,
      photo_status: profile?.photo_status,
    });
    void loadProfiles();
  }, [authLoading, user?.id]);

  const weeklySuggestions = useMemo(
    () =>
      profiles
        .filter((p) => p.commonSportsCount > 0 && isValidProfileId(p.id))
        .slice()
        .sort((a, b) => {
          const aLocal =
            !!myCity && !!a.city && a.city.toLowerCase().trim() === myCity.toLowerCase().trim();
          const bLocal =
            !!myCity && !!b.city && b.city.toLowerCase().trim() === myCity.toLowerCase().trim();
          if (aLocal !== bLocal) return bLocal ? 1 : -1;
          return safeTimeMs(b.created_at) - safeTimeMs(a.created_at);
        })
        .slice(0, 3),
    [profiles, myCity]
  );

  useEffect(() => {
    if (!hasPlus) return;
    setProfiles((prev) =>
      [...prev].sort((a, b) => {
        const aActive = a.is_active_mode === true ? 1 : 0;
        const bActive = b.is_active_mode === true ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        return computeBoostRankingScore(b, profile?.intent ?? null) - computeBoostRankingScore(a, profile?.intent ?? null);
      }),
    );
  }, [hasPlus, profile?.intent]);

  async function loadProfiles() {
    if (!currentUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage("");
    let resultCount = 0;
    try {
      console.log("[Discover feed] currentUserId:", currentUserId);
      void (async () => {
        try {
          await supabase.rpc("touch_profile_activity");
        } catch {
          // Silent by design: should never block Discover rendering.
        }
      })();

      const [likedIds, matchedIds, meRes, blockDetail] = await Promise.all([
        fetchOutgoingLikedUserIds(currentUserId),
        fetchMatchedUserIds(currentUserId),
        supabase
        .from("profiles")
        .select(
          "city, latitude, longitude, discovery_radius_km, gender, looking_for, intent, needs_adapted_activities, sport_practice_type, profile_sports(sports(label, slug))"
        )
        .eq("id", currentUserId)
        .maybeSingle(),
        fetchBlockExclusionDetail(currentUserId),
      ]);

      const meProfile = (meRes.data as unknown as Profile) ?? { profile_sports: [] };
      const blockExclude = blockDetail.excluded;
      const sportsSet = collectSportMatchKeysFromProfile(meProfile);
      setMySportMatchKeys(sportsSet);
      if (import.meta.env.DEV) {
        console.debug("[Discover debug] viewer", {
          currentUserId,
          mySportMatchKeys: [...sportsSet],
        });
      }
      if (meRes.error) {
        console.error("[Discover] profil courant query failed", {
          code: meRes.error.code,
          message: meRes.error.message,
          details: meRes.error.details,
          hint: meRes.error.hint,
          error: meRes.error,
        });
      }
      if (!meRes.data) {
        setErrorMessage("Impossible de charger ton profil courant.");
        setProfiles([]);
        setSwipeHistory([]);
        return;
      }

      if (blockDetail.errors.length > 0) {
        console.warn("[Discover feed] blocks exclusion RPC errors:", blockDetail.errors);
      }

      console.log("[Discover] meProfile raw =", meProfile);
      console.log("[Discover] meProfile.intent raw =", meProfile?.intent);
      console.log("[Discover] parseProfileIntent result =", parseProfileIntent(meProfile?.intent));
      
      const safeMeProfile = {
        ...meProfile,
        intent: meProfile?.intent ?? (meRes.data as { intent?: string | null })?.intent ?? null,
      };
      
      console.log("[Discover] safeMeProfile raw =", safeMeProfile);
      console.log("[Discover] safeMeProfile.intent raw =", safeMeProfile?.intent);
      console.log(
        "[Discover] parseProfileIntent result =",
        parseProfileIntent(safeMeProfile?.intent)
      );
      
      const { data, error } = await supabase.rpc("get_discover_feed_alive", { p_limit: 12 });

      if (error) {
        console.error("[Discover feed] get_discover_feed_alive query failed", {
          code: error.code,
          message: error.message,
        });
        setErrorMessage(discoverFetchFailedMsg(language));
        return;
      }

      const profilesFromRpc: Profile[] = ((data ?? []) as DiscoverAliveRow[])
        .filter((row): row is DiscoverAliveRow & { profile: Profile } =>
          isValidProfileId(row.profile?.id),
        )
        .map((row) => ({
          ...row.profile,
          activity_label: row.activity_label,
          availability_label: row.availability_label,
          vibe_label: row.vibe_label,
          feed_reason: row.feed_reason,
        }));
      console.log("[Discover feed] raw profiles count:", profilesFromRpc.length);
      let raw: Profile[] = profilesFromRpc;
      if (BETA_MODE) {
        raw = raw.filter((p) => String(p.photo_status ?? "").toLowerCase().trim() === "approved");
      }
      console.log("[Discover detail] profils détaillés reçus", {
        count: raw.length,
        ids: raw.map((r) => r.id).filter(Boolean),
      });
      console.log("[Discover feed] profiles after completeness filter:", raw.length);

      if (import.meta.env.DEV) {
        const loadedIds = new Set(raw.map((r) => r.id));
        console.debug("[Discover debug] profils rpc charges", {
          count: loadedIds.size,
          ids: [...loadedIds],
        });
      }

      const distById = new Map<string, number | null>();
      if (raw.length > 0) {
        const { data: distData, error: distErr } = await supabase.rpc("profile_distances_from_viewer", {
          p_candidate_ids: raw.map((p) => p.id),
        });
        if (distErr) {
          console.warn("[Discover feed] profile_distances_from_viewer:", distErr.message);
        } else {
          for (const row of (distData ?? []) as {
            profile_id?: string;
            distance_km?: number | null;
          }[]) {
            const pid = typeof row?.profile_id === "string" ? row.profile_id : "";
            if (pid) distById.set(pid, row.distance_km ?? null);
          }
        }
      }

      raw = raw.filter((p) => {
        if (!p?.id || !isValidProfileId(p.id)) return false;
        if (p.id === currentUserId) return false;
        return true;
      });
      if (likedIds.size > 0) {
        raw = raw.filter((p) => !likedIds.has(p.id));
      }
      if (blockExclude.size > 0) {
        raw = raw.filter((p) => !blockExclude.has(p.id));
      }
      if (matchedIds.size > 0) {
        raw = raw.filter((p) => !matchedIds.has(p.id));
      }
      raw = raw.filter((p) => !isProfileGhostActive(p.id));
      raw = raw.filter((p) => isWithinVisibilityWindow(p.created_at ?? null, hasPlus));

      let stage: Profile[] = raw;
      console.log("[Discover feed] profiles before scoring filters:", stage.length);
      let sharedPlaceById = new Map<string, boolean>();
      if (stage.length > 0) {
        const { data: sharedRows, error: sharedErr } = await supabase.rpc("discover_shared_place_flags", {
          p_viewer_id: currentUserId,
          p_candidate_ids: stage.map((p) => p.id),
        });
        if (sharedErr) {
          console.warn("[Discover feed] discover_shared_place_flags:", sharedErr.message);
        } else {
          for (const row of (sharedRows ?? []) as { profile_id?: string; has_shared_place?: boolean }[]) {
            const pid = typeof row.profile_id === "string" ? row.profile_id : "";
            if (pid) sharedPlaceById.set(pid, row.has_shared_place === true);
          }
        }
      }

      if (stage.length > 0) {
        const paceIds = stage.map((p) => p.id);
        const { data: paceData, error: paceErr } = await supabase
          .from("profiles")
          .select("id, sport_practice_type")
          .in("id", paceIds);
        if (paceErr) {
          if (import.meta.env.DEV) {
            console.warn("[Discover feed] sport_practice_type batch:", paceErr.message);
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

      const discoverFiltered: ProfileWithAffinity[] = scoreAndFilterDiscoverCandidates(
        stage.map((p) => ({ ...p, has_shared_place: sharedPlaceById.get(p.id) === true })),
        {
          viewerId: currentUserId,
          viewer: {
            id: currentUserId,
            gender: meProfile.gender ?? null,
            looking_for: meProfile.looking_for ?? null,
            intent: meProfile.intent ?? null,
            sport_practice_type: meProfile.sport_practice_type ?? null,
          },
          likedIds,
          matchedIds,
          blockedIds: blockExclude,
          mySportMatchKeys: sportsSet,
          distanceById: distById,
        }
      ).map((p) => ({
        ...p,
        reliabilityScore: computeReliabilityScore(p),
      }));

      if (discoverFiltered.length > 0) {
        const candidateIds = discoverFiltered.map((p) => p.id).filter(Boolean);
        const { data: engagementRows, error: engagementError } = await supabase
          .from("user_engagement")
          .select("user_id, reliability_label")
          .in("user_id", candidateIds);
        if (engagementError) {
          console.error("[Discover] user_engagement fetch error:", engagementError);
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
        discoverFiltered[i] = { ...p, is_boost_active: isProfileBoostActive(p.id) };
      }

      discoverFiltered.sort((a, b) => {
        if (hasPlus) {
          // TODO: add +200 ranking score in Discover for active_meetup_mode.
          const aActive = a.is_active_mode === true ? 1 : 0;
          const bActive = b.is_active_mode === true ? 1 : 0;
          if (aActive !== bActive) return bActive - aActive;
        }
        return computeBoostRankingScore(b, meProfile.intent ?? null) - computeBoostRankingScore(a, meProfile.intent ?? null);
      });

      if (import.meta.env.DEV && discoverFiltered.length > 0) {
        for (const p of discoverFiltered.slice(0, 12)) {
          try {
            const b = computeDiscoverMatchScoreBreakdown(p, p.commonSportsCount);
            console.debug("[Discover score]", p.first_name ?? p.id, {
              reliability: p.reliabilityScore,
              match: b,
              score: p.discoverScore,
              sharedSportsCount: p.commonSportsCount,
              distanceKm: p.distanceKm,
              reasons: p.discover_reasons,
            });
          } catch (e) {
            console.error("[Discover score] breakdown debug failed", { id: p.id, err: e });
          }
        }
      }

      const safe = discoverFiltered.filter((p) => p?.id && isValidProfileId(p.id));
      const slice = safe.slice(0, DISCOVER_DISPLAY_LIMIT);
      resultCount = slice.length;
      console.log("[Discover feed] final profiles count:", resultCount);
      setProfiles(slice);
      setSwipeHistory([]);
    } catch (e) {
      console.error("[Discover] loadProfiles erreur inattendue:", e);
      setErrorMessage(discoverFetchFailedMsg(language));
    } finally {
      setLoading(false);
      console.debug("[Discover debug] loadProfiles terminé", {
        discoverLoading: false,
        currentUserId,
        profile_completed: profile?.profile_completed,
        profilesCount: resultCount,
      });
    }
  }

  async function handlePass(profileId: string, decisionTimeMs = 0) {
    setDiscoverMenuProfileId(null);
    if (currentUserId && isValidProfileId(profileId)) {
      const { data: passRpcData, error: rpcErr } = await supabase.rpc("pass_profile", {
        p_passed_profile_id: profileId,
      });
      if (rpcErr) {
        console.error("[Discover] pass_profile", rpcErr);
        setRewindError(t("discover_rewind_err_generic"));
        return;
      }
      const passDeclined =
        passRpcData &&
        typeof passRpcData === "object" &&
        (passRpcData as { ok?: boolean }).ok === false;
      if (passDeclined) {
        console.error("[Discover] pass_profile declined", passRpcData);
        setRewindError(t("discover_rewind_err_generic"));
        return;
      }
      setRewindToast(t("discover_profile_passed"));
    }
    let removed: ProfileWithAffinity | undefined;
    setProfiles((prev) => {
      removed = prev.find((p) => p.id === profileId);
      return prev.filter((p) => p.id !== profileId);
    });
    if (removed != null) {
      const p = removed;
      setSwipeHistory((h) => [...h, { profile: p, action: "pass" }]);
    }
    if (removed?.id === lastRestoredProfileId) {
      setLastRestoredProfileId(null);
    }
    if (currentUserId && isValidProfileId(profileId)) {
      const r = await recordDiscoverSwipe({
        targetId: profileId,
        action: "pass",
        decisionTimeMs,
        isMatch: false,
      });
      if (!r.ok) console.warn("[Discover] record pass swipe", r.error);
      refreshRewindStatus();
    }
    if (removed != null) {
      setSecondChanceTarget(removed);
    } else {
      setSecondChanceTarget(null);
    }
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
    setProfiles((prev) => prev.filter((p) => p.id !== blockedUserId));
    setPreviewProfile((prev) => (prev?.id === blockedUserId ? null : prev));
  }

  function handleViewProfileFromSuggestion(p: ProfileWithAffinity) {
    if (!isValidProfileId(p.id)) return;
    setPreviewProfile(p);
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
      conversation_id = await fetchConversationIdForPair(currentUserId, profile.id);
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

    setSwipeHistory((h) => [...h, { profile, action: "like" }]);

    const removeFromFeed = () => {
      setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
    };

    if (is_match && conversation_id) {
      try {
        sessionStorage.setItem(`splove_conv_sports_${conversation_id}`, JSON.stringify(shared));
      } catch {
        /* quota */
      }
      removeFromFeed();
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
      console.warn("[LIKE DEBUG] previewProfile missing");
      return;
    }

    setLikeActionError(null);

    console.log("[LIKE DEBUG]", {
      firstName: previewProfile.first_name,
      profileId: previewProfile.id,
      profileIdType: typeof previewProfile.id,
      previewProfile,
      payload: { p_liked_id: previewProfile.id },
    });

    await handleLike(previewProfile, 0);
    setPreviewProfile(null);
  };

  const rewindBarHint = useMemo(() => {
    if (!rewindStatus) return null;
    if (rewindStatus.suggest_paywall && !rewindStatus.can_rewind) {
      return t("discover_rewind_paywall_hint");
    }
    const n = typeof rewindStatus.undo_credits === "number" ? rewindStatus.undo_credits : 0;
    if (n > 0) {
      return t("discover_rewind_credits", { n });
    }
    return null;
  }, [rewindStatus, t]);

  /** Retour (rewind) : si droit ou crédit → `handleRewind` ; sinon écran SPLove+ (fonction Retour). */
  async function handleUndoTap() {
    if (!currentUserId || rewindBusy) return;
    const latest = await getDiscoverRewindStatus();
    if (latest) setRewindStatus(latest);

    if (
      !latest?.last_swipe_at ||
      latest.last_is_match ||
      String(latest.last_action ?? "").toLowerCase() !== "pass"
    ) {
      return;
    }

    if (!latest.can_rewind) {
      navigate("/splove-plus", { state: { sploveHighlightFeature: "undo_swipe_return" } });
      return;
    }

    await handleRewind();
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

  async function runRewindFlow(optimistic: DiscoverSwipeHistoryEntry | null) {
    setRewindBusy(true);
    setRewindError(null);
    try {
      const res = await rewindLastDiscoverSwipe();
      if (!res.ok || !res.target_id) {
        if (optimistic) {
          setProfiles((p) => p.filter((x) => x.id !== optimistic.profile.id));
          setSwipeHistory((prev) => [...prev, optimistic]);
        }
        const err = (res.error ?? "generic").toLowerCase();
        if (err.includes("time_window") || err.includes("rewind_rate")) {
          setRewindError(t("discover_rewind_err_upgrade"));
        } else if (err.includes("no_undo_credits")) {
          setRewindError(t("discover_rewind_err_no_credits"));
        } else if (err.includes("match")) setRewindError(t("discover_rewind_err_match"));
        else if (err.includes("no_swipe")) setRewindError(t("discover_rewind_err_none"));
        else setRewindError(t("discover_rewind_err_generic"));
        return;
      }
      void refetchProfile();
      const fromLocal =
        optimistic && optimistic.profile.id === res.target_id ? optimistic.profile : null;

      const me = profile as Profile | null;
      if (!me?.id) {
        setRewindError(t("discover_rewind_err_generic"));
        return;
      }
      let restored: ProfileWithAffinity | null = fromLocal;
      if (!restored) {
        restored = await buildAffinityProfileForRewind({
          currentUserId,
          targetId: res.target_id,
          meProfile: me,
          mySportMatchKeys,
        });
      }
      if (!restored) {
        setRewindError(t("discover_rewind_restore_failed"));
        return;
      }
      if (!optimistic) {
        setSwipeHistory((prev) => {
          if (prev.length && prev[prev.length - 1].profile.id === res.target_id) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
      const card = restored;
      setProfiles((p) => (p.some((x) => x.id === card.id) ? p : [card, ...p]));
      setRewindRestoredId(card.id);
      setRewindToast("Profil restaure");
      refreshRewindStatus();
    } finally {
      setRewindBusy(false);
    }
  }

  async function handleRewind() {
    if (!currentUserId || rewindBusy) return;
    const latest = await getDiscoverRewindStatus();
    if (latest) setRewindStatus(latest);
    const h = swipeHistoryRef.current;
    const last = h[h.length - 1] ?? null;
    if (last) {
      setSwipeHistory((prev) => prev.slice(0, -1));
      setProfiles((p) => (p.some((x) => x.id === last.profile.id ? true : false) ? p : [last.profile, ...p]));
      setRewindRestoredId(last.profile.id);
      setRewindRestoredFrom(last.action === "pass" ? "left" : "right");
      setRewindToast("Profil restaure");
    }
    void runRewindFlow(last);
  }

  if (!authLoading && user?.id && isProfileLoading) {
    return (
      <div className="min-h-0 bg-app-bg font-sans">
        <main
          className="mx-auto max-w-md px-4 pb-8 pt-8"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={t("loading")}
        >
          <div className="space-y-0">
            {[0, 1, 2].map((i) => (
              <DiscoverProfileCardSkeleton key={i} />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-0 bg-app-bg font-sans">
      <main
        className={`mx-auto max-w-md px-4 pt-1 ${currentUserId && !errorMessage && !loading ? "pb-24" : "pb-8"}`}
      >
        <section className="mb-5 px-0.5 text-center">
          <p className="mt-2.5 text-center text-xl font-semibold leading-tight tracking-tight text-app-text">
            {t("discover.heroTitle")}
          </p>
          <p className="mx-auto mt-2 max-w-[21rem] text-[13px] leading-relaxed text-app-muted">
            {t("discover.heroSubtitle")}
          </p>
          <p className="mx-auto mt-2 max-w-[22rem] text-[12px] font-medium italic leading-snug text-app-muted/90">
            {t("discover.heroTagline")}
          </p>
          {formatViewerRadiusLabel(myDiscoveryRadiusKm) ? (
            <p className="mx-auto mt-1.5 max-w-[21rem] text-[11px] font-medium text-app-muted">
              {formatViewerRadiusLabel(myDiscoveryRadiusKm)}
            </p>
          ) : null}
          {myCity ? (
            <p className="mx-auto mt-0.5 max-w-[21rem] text-[11px] text-app-muted">{t("discover.yourCityLine", { city: myCity })}</p>
          ) : null}
          {currentUserId ? (
            <div className="mx-auto mt-4 w-full max-w-[21rem] rounded-2xl border border-emerald-500/35 bg-emerald-500/[0.07] px-3 py-3 text-left shadow-sm ring-1 ring-emerald-500/[0.12] dark:bg-emerald-950/35">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900 dark:text-emerald-100/95">
                {t("discover.meetModeHeading")}
              </p>
              <p className="mt-1.5 text-[12px] leading-snug text-app-text">
                {viewerMeetActive ? t("discover.meetModeOnBody") : t("discover.meetModeOffBody")}
              </p>
              <Link
                to="/profile"
                className="mt-2 inline-block text-[12px] font-semibold text-emerald-700 underline decoration-emerald-500/50 underline-offset-2 dark:text-emerald-200"
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
          {currentUserId ? (
            <div className="mx-auto mt-3 flex max-w-[21rem] flex-wrap items-center justify-center gap-2">
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
            <p className="mx-auto mt-2 max-w-[22rem] text-center text-[12px] text-amber-100/90">{rewindError}</p>
          ) : null}
          {rewindStatus &&
          !rewindStatus.has_premium &&
          !rewindStatus.can_rewind &&
          (rewindStatus.reason === "time_window" || rewindStatus.reason === "rewind_rate") &&
          !rewindError ? (
            <p className="mx-auto mt-2 max-w-[22rem] text-center text-[12px] leading-snug text-app-muted">
              {t("discover_rewind_err_upgrade")}
            </p>
          ) : null}
          {boostStats.isActive ? (
            <div className="mx-auto mt-3 max-w-[21rem] rounded-xl border border-fuchsia-400/35 bg-fuchsia-500/10 px-3 py-2 text-[12px] font-medium text-fuchsia-100">
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
        </section>

        {loading && !errorMessage && (
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label={t("loading")}
            className="space-y-0"
          >
            {[0, 1, 2].map((i) => (
              <DiscoverProfileCardSkeleton key={i} />
            ))}
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
            className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-950/35 px-4 py-3 text-sm text-emerald-50 shadow-sm ring-1 ring-emerald-500/10"
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
            className="mb-4 rounded-2xl border border-app-border bg-app-card px-4 py-3 text-sm text-app-text shadow-sm ring-1 ring-white/[0.04]"
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
          <div className="mb-4">
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
          <p className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100/95">
            {secondChanceToast}
          </p>
        ) : null}

        {likeActionError && (
          <p className="mb-4 rounded-xl border border-amber-500/25 bg-amber-950/35 px-3 py-2 text-sm text-amber-100">
            {likeActionError}
          </p>
        )}

        {blockActionError && (
          <p className="mb-4 rounded-xl border border-amber-500/25 bg-amber-950/35 px-3 py-2 text-sm text-amber-100">
            {blockActionError}
          </p>
        )}

        {boostLifecycleMessage ? (
          <p className="mb-4 rounded-xl border border-fuchsia-400/30 bg-fuchsia-950/30 px-3 py-2 text-sm text-fuchsia-100">
            {boostLifecycleMessage}
          </p>
        ) : null}

        {currentUserId && !loading && !errorMessage && profiles.length <= 3 ? (
          <div className="mb-4">
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

        {!loading && !errorMessage && profiles.length === 0 ? (
          <EmptyDiscoverState onRefresh={() => void loadProfiles()} />
        ) : null}

        {!loading &&
          !errorMessage &&
          profiles.map((profile) => (
            <div
              key={profile.id}
              style={
                rewindRestoredId === profile.id
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
                profile={profile}
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
                handleUndo={() => void handleUndoTap()}
                canUndo={canUndo}
                restoredProfileId={restoredProfileId}
              />
            </div>
          ))}

        {!loading && !errorMessage && weeklySuggestions.length > 0 && (
          <div className="mb-5 mt-6">
            <PremiumSuggestionsSection
              title={t("discover.free_shortcuts")}
              subtitle={t("discover.free_shortcuts_description")}
              commonSportLabel={t("discover.common_ground")}
              items={weeklySuggestions.map((p) => {
                const cs = firstCommonSportName(p, mySportMatchKeys);
                return {
                  id: p.id,
                  photoUrl: getProfileDisplayPhotoUrl(p),
                  firstName: p.first_name?.trim() || "Profil",
                  age: getAgeFromBirthDate(p.birth_date ?? null),
                  commonSport: cs ?? "",
                  projectionCopy: cs
                    ? `${t("discover.common_ground")} : ${cs} — ${t("discover.ready_to_suggest")}`
                    : t("discover.real_outing_intent"),
                  verified: isPhotoVerified(p),
                };
              })}
              ctaLabel={t("discover_profiles")}
              onCardCta={(id) => {
                const sid = String(id).trim();
                const p = weeklySuggestions.find(
                  (x) => x.id === sid || x.id.toLowerCase() === sid.toLowerCase()
                );
                if (p) handleViewProfileFromSuggestion(p);
              }}
            />
          </div>
        )}

      </main>

      {crossingsOpen ? (
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

      {previewProfile ? (
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

      {reportProfileId && currentUserId && (
        <ReportModal
          reportedProfileId={reportProfileId}
          reporterId={currentUserId}
          onClose={() => setReportProfileId(null)}
        />
      )}

      {reportPhotoTarget && currentUserId && (
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

      {currentUserId && !errorMessage && !loading && canUndo ? (
        <DiscoverRewindButton
          onRewind={() => void handleUndoTap()}
          disabled={rewindBusy}
          busy={rewindBusy}
          actionLabel={t("discover_undo_action")}
          hint={rewindBarHint}
          aria-label={t("discover_undo_action")}
        />
      ) : null}

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
