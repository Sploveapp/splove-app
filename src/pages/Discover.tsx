import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { ReportModal } from "../components/ReportModal";
import { PremiumSuggestionsSection } from "../components/PremiumSuggestionsSection";
import { BLOCK_PROFILE_CONFIRM, BLOCK_PROFILE_LINK_LABEL, REPORT_LINK_LABEL } from "../constants/copy";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import {
  IconBanSoft,
  IconHeartFilled,
  IconHeartOutline,
  IconPass,
  IconProfileAvatarPlaceholder,
} from "../components/ui/Icon";
import { isPreferenceCompatible } from "../lib/matchingPreferences";
import { mutualAccessibilityCompatible } from "../lib/accessibilityMatching";
import { parseProfileIntent, PROFILE_INTENT_AMICAL, PROFILE_INTENT_AMOUR } from "../lib/profileIntent";
import { fetchBlockExclusionDetail, isBlockedWith } from "../services/blocks.service";
import { VerifiedBadge } from "../components/VerifiedBadge";
import { isPhotoVerificationApproved, isPhotoVerified } from "../lib/profileVerification";
import { PhotoVerificationDiscoverGate } from "../components/PhotoVerificationDiscoverGate";
import {
  collectSportMatchKeysFromProfile,
  getSharedSportLabelsForMatch,
} from "../lib/sportMatchGroups";

type Profile = {
  id: string;
  first_name: string | null;
  /** May be absent on feed_profiles depending on the view. */
  city?: string | null;
  birth_date?: string | null;
  created_at?: string | null;
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
  /** Voir `profiles.is_photo_verified` (Veriff). */
  is_photo_verified?: boolean | null;
  photo_status?: string | null;
  needs_adapted_activities?: boolean | null;
  pref_open_to_standard_activity?: boolean | null;
  pref_open_to_adapted_activity?: boolean | null;
  profile_sports?: { sports: { label: string | null; slug?: string | null } | null }[];
};

/** Resolve photo URL from whatever columns the feed_profiles row actually includes. */
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

function intentShortLabel(intent: string | null | undefined): string | null {
  const parsed = parseProfileIntent(intent);
  if (parsed === PROFILE_INTENT_AMICAL) return "Rencontre en mouvement";
  if (parsed === PROFILE_INTENT_AMOUR) return "Rencontre amoureuse";
  return null;
}

type ProfileWithAffinity = Profile & {
  commonSportsCount: number;
  discoverScore: number;
};

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

/** Une ligne sous le prénom — phrase profil ou accroche courte. */
function profileOneLineTagline(profile: Profile, firstCommon: string | null): string {
  const f = profile.sport_feeling?.trim();
  if (f) return `Se sent ${f} en bougeant.`;
  if (firstCommon) return `${firstCommon} — envie de bouger ensemble ?`;
  return "Rencontre par le sport, pour de vrai.";
}

function recencyScore(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  const ts = new Date(createdAt).getTime();
  if (Number.isNaN(ts)) return 0;
  const ageMs = Date.now() - ts;
  const day = 24 * 60 * 60 * 1000;
  if (ageMs <= day) return 30;
  if (ageMs <= 3 * day) return 20;
  if (ageMs <= 7 * day) return 10;
  return 0;
}

function computeDiscoverScore(profile: Profile, commonCount: number): number {
  const hasMeetingSignals = Boolean(
    getProfileDisplayPhotoUrl(profile) && profile.first_name?.trim() && profile.birth_date
  );
  const readinessBonus = hasMeetingSignals ? 15 : 0;
  const sportFeelingBonus = profile.sport_feeling?.trim() ? 5 : 0;
  const strongSharedSportBonus = commonCount >= 2 ? 25 : 0;
  return (
    commonCount * 100 +
    recencyScore(profile.created_at) +
    readinessBonus +
    sportFeelingBonus +
    strongSharedSportBonus
  );
}

const DISCOVER_FETCH_LIMIT = 80;
const DISCOVER_DISPLAY_LIMIT = 10;

const SWIPE_COMMIT_PX = 72;
const TAP_MAX_PX = 15;
const SWIPE_DAMP = 0.55;

/**
 * `feed_profiles` in production may omit many `profiles` columns — only `id` is requested here.
 * Full rows are loaded from `public.profiles` in a second query (same file).
 */
const FEED_PROFILE_IDS_SELECT = "id";

/** Columns for Discover cards — queried on `profiles`, not on the narrowed `feed_profiles` view. */
const DISCOVER_PROFILES_DETAIL_SELECT =
  "id, first_name, birth_date, created_at, gender, looking_for, intent, sport_feeling, portrait_url, fullbody_url, avatar_url, main_photo_url, city, profile_completed, is_photo_verified, photo_status, needs_adapted_activities, profile_sports!inner(sports(label, slug))";

/** IDs déjà likés — union liker_id/liked_id et from_user/to_user (schémas réels mixtes). */
async function fetchOutgoingLikedUserIds(userId: string): Promise<Set<string>> {
  const out = new Set<string>();
  const add = (ids: (string | null | undefined)[]) => {
    for (const x of ids) {
      if (typeof x === "string" && x.length > 0) out.add(x);
    }
  };

  const [rLiker, rLegacy] = await Promise.all([
    supabase.from("likes").select("liked_id").eq("liker_id", userId),
    supabase.from("likes").select("to_user").eq("from_user", userId),
  ]);

  if (rLiker.error) {
    console.warn("[Discover feed] likes (liker_id / liked_id):", rLiker.error.message);
  } else {
    add((rLiker.data ?? []).map((row: { liked_id?: string | null }) => row.liked_id));
  }

  if (rLegacy.error) {
    console.warn("[Discover feed] likes (from_user / to_user):", rLegacy.error.message);
  } else {
    add((rLegacy.data ?? []).map((row: { to_user?: string | null }) => row.to_user));
  }

  return out;
}
/** `public.profiles.id` PK shape — drops malformed ids before like RPC / FK on likes.liked_id. */
const PROFILE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidProfileId(id: string | null | undefined): id is string {
  return typeof id === "string" && PROFILE_ID_RE.test(id);
}

type DiscoverSwipeCardProps = {
  profile: ProfileWithAffinity;
  /** Clés de matching (groupes + sports uniques), pas les libellés bruts. */
  mySportMatchKeys: Set<string>;
  discoverMenuProfileId: string | null;
  setDiscoverMenuProfileId: Dispatch<SetStateAction<string | null>>;
  onPass: (id: string) => void;
  onLike: (p: ProfileWithAffinity) => void;
  onOpenDetail: (p: ProfileWithAffinity) => void;
  onReport: (id: string) => void;
  onBlock: (id: string) => void | Promise<void>;
};

const DiscoverSwipeCard = memo(function DiscoverSwipeCard({
  profile,
  mySportMatchKeys,
  discoverMenuProfileId,
  setDiscoverMenuProfileId,
  onPass,
  onLike,
  onOpenDetail,
  onReport,
  onBlock,
}: DiscoverSwipeCardProps) {
  const age = getAgeFromBirthDate(profile.birth_date ?? null);
  const firstCommon = firstCommonSportName(profile, mySportMatchKeys);
  const sharedSports = getSharedSportsFromProfile(mySportMatchKeys, profile);
  const tagline = profileOneLineTagline(profile, firstCommon);
  const strongAffinity = profile.commonSportsCount >= 2;
  const photo = getProfileDisplayPhotoUrl(profile) ?? "";

  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  function onSwipeZonePointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onSwipeZonePointerMove(e: React.PointerEvent) {
    if (startRef.current == null) return;
    const rdx = e.clientX - startRef.current.x;
    const rdy = e.clientY - startRef.current.y;
    if (Math.abs(rdx) > Math.abs(rdy) && Math.abs(rdx) > 6) {
      e.preventDefault();
    }
    setDx(rdx * SWIPE_DAMP);
  }

  function onSwipeZonePointerUp(e: React.PointerEvent) {
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
      onOpenDetail(profile);
      return;
    }

    if (totalDx <= -SWIPE_COMMIT_PX) {
      setDx(-Math.min(420, window.innerWidth));
      window.setTimeout(() => {
        setDx(0);
        onPass(profile.id);
      }, 190);
      return;
    }
    if (totalDx >= SWIPE_COMMIT_PX) {
      setDx(Math.min(420, window.innerWidth));
      window.setTimeout(() => {
        setDx(0);
        void onLike(profile);
      }, 190);
      return;
    }

    setDx(0);
  }

  function onSwipeZonePointerCancel(e: React.PointerEvent) {
    startRef.current = null;
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
      className={`mb-7 flex max-h-[min(88vh,820px)] min-h-[min(520px,85svh)] flex-col overflow-hidden rounded-3xl bg-app-card shadow-lg ring-1 ring-app-border/90 ${
        strongAffinity ? "ring-2 ring-emerald-200/70" : ""
      }`}
    >
      <div
        className="relative min-h-[240px] w-full flex-[4] basis-0 cursor-grab touch-none bg-app-border active:cursor-grabbing"
        style={{
          transform: `translateX(${dx}px) rotate(${rot}deg)`,
          transition: dragging ? "none" : "transform 0.2s ease-out, opacity 0.2s ease-out",
          opacity: liftOpacity,
        }}
        onPointerDown={onSwipeZonePointerDown}
        onPointerMove={onSwipeZonePointerMove}
        onPointerUp={onSwipeZonePointerUp}
        onPointerCancel={onSwipeZonePointerCancel}
      >
        {photo ? (
          <img
            src={photo}
            alt={profile.first_name ? `Photo de ${profile.first_name}` : "Photo du profil"}
            className="absolute inset-0 h-full w-full object-cover pointer-events-none"
          />
        ) : (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-app-border">
            <IconProfileAvatarPlaceholder className="text-app-muted/80" size={88} />
          </div>
        )}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/85 via-black/35 to-transparent"
          aria-hidden
        />
        {strongAffinity ? (
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-app-card/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 shadow-sm backdrop-blur-sm">
            Top match
          </div>
        ) : null}
        <div className="absolute right-2 top-2 z-20" data-discover-menu-root>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={discoverMenuProfileId === profile.id}
            aria-label="Plus d’actions"
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={() =>
              setDiscoverMenuProfileId((id) => (id === profile.id ? null : profile.id))
            }
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-lg font-bold leading-none text-white backdrop-blur-sm hover:bg-black/45"
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
            </div>
          ) : null}
        </div>
        {Math.abs(dx) > 36 ? (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 flex w-14 items-center justify-center text-[11px] font-bold uppercase tracking-wide text-white/85 opacity-40"
            aria-hidden
          >
            {dx < 0 ? "Pass" : ""}
          </div>
        ) : null}
        {Math.abs(dx) > 36 ? (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 flex w-14 items-center justify-center text-[11px] font-bold uppercase tracking-wide text-white/85 opacity-40"
            aria-hidden
          >
            {dx > 0 ? "Like" : ""}
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-5 pt-20 sm:px-5 sm:pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[1.65rem] font-bold leading-none tracking-tight text-white drop-shadow-md sm:text-3xl">
              {profile.first_name ?? "Sans prénom"}
              {age != null ? <span className="font-bold text-white/95">, {age}</span> : null}
            </h2>
            {isPhotoVerified(profile) ? (
              <span className="pointer-events-auto shrink-0">
                <VerifiedBadge className="!bg-app-card/95 !text-emerald-900 !ring-emerald-600/25" />
              </span>
            ) : null}
          </div>
          {sharedSports.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {sharedSports.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-app-card/22 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm ring-1 ring-white/35 backdrop-blur-[2px]"
                >
                  {name}
                </span>
              ))}
            </div>
          ) : null}
          <p className="mt-2.5 line-clamp-1 text-[15px] font-medium leading-snug text-white/95 drop-shadow-sm">
            {tagline}
          </p>
          {profile.city ? (
            <p className="mt-1 text-[11px] font-medium tracking-wide text-white/55">{profile.city}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-3 border-t border-app-border/90 bg-app-card px-3 py-4 sm:px-4">
        <div className="flex items-stretch gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={() => onPass(profile.id)}
            className="flex w-[3.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl py-2 text-[11px] font-medium text-app-muted transition hover:bg-app-border hover:text-app-muted"
            aria-label="Passer ce profil"
          >
            <IconPass size={20} />
            <span>Pass</span>
          </button>
          <button
            type="button"
            onClick={() => void onLike(profile)}
            className="min-h-[52px] min-w-0 flex-1 rounded-2xl px-2 py-3 text-[15px] font-bold leading-tight shadow-md transition hover:opacity-95 active:scale-[0.99] sm:text-base"
            style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
          >
            Proposer un moment
          </button>
          <button
            type="button"
            onClick={() => void onLike(profile)}
            className="group flex w-[3.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-app-border bg-app-card py-2 text-[11px] font-semibold text-app-text shadow-sm transition hover:bg-app-border"
            aria-label="J’aime ce profil"
          >
            <span className="relative inline-flex h-5 w-5 items-center justify-center">
              <IconHeartOutline
                size={20}
                color="#FF1E2D"
                className="absolute transition-opacity duration-150 ease-out group-active:opacity-0"
              />
              <IconHeartFilled
                size={20}
                color="#FF1E2D"
                className="absolute opacity-0 transition-opacity duration-150 ease-out group-active:opacity-100"
              />
            </span>
            <span>Like</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => onReport(profile.id)}
          className="w-full py-0.5 text-center text-[11px] text-app-muted underline decoration-app-border underline-offset-2 hover:text-app-muted"
        >
          {REPORT_LINK_LABEL}
        </button>
      </div>
    </article>
  );
});

export default function Discover() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, profile, refetchProfile } = useAuth();
  const currentUserId = user?.id ?? "";
  const [profiles, setProfiles] = useState<ProfileWithAffinity[]>([]);
  const [mySportMatchKeys, setMySportMatchKeys] = useState<Set<string>>(new Set());
  const [myCity, setMyCity] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [reportProfileId, setReportProfileId] = useState<string | null>(null);
  const [likeFeedbackMode, setLikeFeedbackMode] = useState<null | "like" | "match">(null);
  const [likeActionError, setLikeActionError] = useState<string | null>(null);
  const [discoverMenuProfileId, setDiscoverMenuProfileId] = useState<string | null>(null);
  const [blockActionError, setBlockActionError] = useState<string | null>(null);
  /** Same row object as weekly suggestions / main feed — avoids find-by-id mismatch for Like. */
  const [previewProfile, setPreviewProfile] = useState<ProfileWithAffinity | null>(null);
  const likeInFlightRef = useRef<Set<string>>(new Set());
  const blockInFlightRef = useRef<Set<string>>(new Set());

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
    if (!discoverMenuProfileId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.("[data-discover-menu-root]")) return;
      setDiscoverMenuProfileId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [discoverMenuProfileId]);

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
    if (!profile?.id) {
      return;
    }
    if (!isPhotoVerificationApproved(profile.photo_status)) {
      setLoading(false);
      setProfiles([]);
      console.error("[Discover] loadProfiles skipped: photo_status is not approved", {
        photo_status: profile.photo_status,
      });
      return;
    }
    void loadProfiles();
  }, [authLoading, user?.id, profile?.id, profile?.photo_status]);

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
          return b.discoverScore - a.discoverScore;
        })
        .slice(0, 3),
    [profiles, myCity]
  );

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

      const [likedIds, meRes, blockDetail] = await Promise.all([
        fetchOutgoingLikedUserIds(currentUserId),
        supabase
          .from("profiles")
          .select(
            "city, gender, looking_for, intent, needs_adapted_activities, profile_sports(sports(label, slug))",
          )
          .eq("id", currentUserId)
          .maybeSingle(),
        fetchBlockExclusionDetail(currentUserId),
      ]);

      const meProfile = (meRes.data as unknown as Profile) ?? { profile_sports: [] };
      const blockExclude = blockDetail.excluded;
      const sportsSet = collectSportMatchKeysFromProfile(meProfile);
      setMySportMatchKeys(sportsSet);
      const meCity =
        ((meRes.data as { city?: string | null } | null)?.city ?? null)?.trim() || null;
      setMyCity(meCity);
      if (meRes.error) {
        console.warn("Discover: profil courant", meRes.error);
      }

      if (blockDetail.errors.length > 0) {
        console.warn("[Discover feed] blocks exclusion RPC errors:", blockDetail.errors);
      }

      const myIntent = parseProfileIntent(meProfile.intent);
      if (!myIntent) {
        console.warn(
          `[Discover feed] STOP intent invalide: "${String(meProfile.intent)}" (attendu Amical|Amoureux)`,
        );
        setProfiles([]);
        return;
      }

      const likedList = [...likedIds];
      const useNotIn = likedList.length > 0 && likedList.length < 200;
      const notInClause = useNotIn ? `(${likedList.join(",")})` : null;

      let feedIdsQ = supabase
        .from("feed_profiles")
        .select(FEED_PROFILE_IDS_SELECT)
        .neq("id", currentUserId)
        .eq("intent", myIntent)
        .order("id", { ascending: false })
        .limit(DISCOVER_FETCH_LIMIT);

      if (notInClause) {
        feedIdsQ = feedIdsQ.not("id", "in", notInClause);
      }

      const feedRes = await feedIdsQ;

      if (feedRes.error) {
        console.error(feedRes.error);
        setErrorMessage(feedRes.error.message);
        return;
      }

      const feedRowsRaw = (feedRes.data as { id: string }[] | null) ?? [];
      console.log("[Discover feed] raw profiles count:", feedRowsRaw.length);

      let feedIds = feedRowsRaw.map((r) => r.id).filter(isValidProfileId);
      feedIds = feedIds.filter((id) => id !== currentUserId);
      console.log("[Discover feed] profiles after self filter:", feedIds.length);
      if (!useNotIn && likedIds.size > 0) {
        feedIds = feedIds.filter((id) => !likedIds.has(id));
      }
      if (blockExclude.size > 0) {
        feedIds = feedIds.filter((id) => !blockExclude.has(id));
      }
      console.log("[Discover feed] profiles after block filter:", feedIds.length);

      if (feedIds.length === 0) {
        console.warn("[Discover feed] final profiles count:", 0);
        setProfiles([]);
        return;
      }

      const othersRes = await supabase
        .from("profiles")
        .select(DISCOVER_PROFILES_DETAIL_SELECT)
        .in("id", feedIds)
        .eq("intent", myIntent)
        .eq("profile_completed", true)
        .eq("photo_status", "approved")
        .not("first_name", "is", null)
        .neq("first_name", "")
        .not("birth_date", "is", null)
        .order("created_at", { ascending: false, nullsFirst: false });

      if (othersRes.error) {
        console.error(othersRes.error);
        setErrorMessage(othersRes.error.message);
        return;
      }

      let raw = (othersRes.data as unknown as Profile[] | null) ?? [];
      raw = raw.filter((p) => isPhotoVerificationApproved(p.photo_status));
      console.log("[Discover feed] profiles after completeness/photo filter:", raw.length);

      const meForCompat = {
        gender: meProfile.gender ?? null,
        looking_for: meProfile.looking_for ?? null,
      };

      const meForAccessibility = {
        needs_adapted_activities: meProfile.needs_adapted_activities,
        pref_open_to_standard_activity: meProfile.pref_open_to_standard_activity,
        pref_open_to_adapted_activity: meProfile.pref_open_to_adapted_activity,
      };

      const feedIdSet = new Set(feedIds);
      raw = raw.filter((p) => {
        if (!p?.id || !isValidProfileId(p.id)) return false;
        if (!feedIdSet.has(p.id)) return false;
        return true;
      });
      if (!useNotIn && likedIds.size > 0) {
        raw = raw.filter((p) => !likedIds.has(p.id));
      }
      if (blockExclude.size > 0) {
        raw = raw.filter((p) => !blockExclude.has(p.id));
      }

      /** Filtre défensif : même intention (normalisée) que l’utilisateur. */
      raw = raw.filter((p) => parseProfileIntent(p.intent) === myIntent);
      console.log("[Discover feed] profiles after intent filter:", raw.length);

      /** Flux principal : genre/préférence + sport commun + préférences activités adaptées (rééciproque). */
      raw = raw.filter((p) => {
        if (!isPreferenceCompatible(meForCompat, p)) return false;
        if (getSharedSportsFromProfile(sportsSet, p).length === 0) return false;
        if (
          !mutualAccessibilityCompatible(meForAccessibility, {
            needs_adapted_activities: p.needs_adapted_activities,
            pref_open_to_standard_activity: p.pref_open_to_standard_activity,
            pref_open_to_adapted_activity: p.pref_open_to_adapted_activity,
          })
        ) {
          return false;
        }
        return true;
      });
      console.log("[Discover feed] profiles after shared sports filter:", raw.length);

      const enriched: ProfileWithAffinity[] = raw.map((p) => {
        const common = commonSportsCount(sportsSet, p);
        return {
          ...p,
          commonSportsCount: common,
          discoverScore: computeDiscoverScore(p, common),
        };
      });

      enriched.sort((a, b) => {
        if (b.discoverScore !== a.discoverScore) {
          return b.discoverScore - a.discoverScore;
        }
        if (b.commonSportsCount !== a.commonSportsCount) {
          return b.commonSportsCount - a.commonSportsCount;
        }
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return (a.first_name ?? "").localeCompare(b.first_name ?? "", "fr");
      });

      const safe = enriched.filter((p) => p?.id && isValidProfileId(p.id));
      const slice = safe.slice(0, DISCOVER_DISPLAY_LIMIT);
      resultCount = slice.length;
      console.log("[Discover feed] final profiles count:", resultCount);
      setProfiles(slice);
    } catch (e) {
      console.error("[Discover] loadProfiles erreur inattendue:", e);
      setErrorMessage(e instanceof Error ? e.message : "Chargement impossible. Réessayez.");
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

  function handlePass(profileId: string) {
    setDiscoverMenuProfileId(null);
    setProfiles((prev) => prev.filter((p) => p.id !== profileId));
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

  async function handleLike(profile: ProfileWithAffinity) {
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

    await handleLike(previewProfile);
    setPreviewProfile(null);
  };

  if (!authLoading && user?.id) {
    if (!profile) {
      return (
        <div className="min-h-0 bg-app-bg font-sans">
          <main className="mx-auto max-w-md px-4 pb-8 pt-8">
            <p className="text-center text-sm text-app-muted">Chargement du profil…</p>
          </main>
        </div>
      );
    }
    if (!isPhotoVerificationApproved(profile.photo_status)) {
      return (
        <PhotoVerificationDiscoverGate
          profile={profile}
          onRefresh={() => void refetchProfile()}
        />
      );
    }
  }

  return (
    <div className="min-h-0 bg-app-bg font-sans">
      <main className="mx-auto max-w-md px-4 pb-8 pt-1">
        <section className="mb-5 px-0.5 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-app-muted">
            Rencontres par le sport
          </p>
          <p className="mt-2.5 text-xl font-bold leading-snug tracking-tight text-app-text">
            Trouver l’amour par le sport
          </p>
          <p className="mx-auto mt-2 max-w-[21rem] text-[13px] leading-relaxed text-app-muted">
            Likez pour commencer. Proposez un moment pour vraiment se rencontrer.
          </p>
        </section>

        {loading && (
          <p className="text-center text-sm text-app-muted">Chargement des profils…</p>
        )}

        {errorMessage && (
          <p className="mb-4 rounded-xl border border-red-500/25 bg-red-950/40 px-3 py-2 text-sm text-red-100">
            {errorMessage}
          </p>
        )}

        {likeFeedbackMode === "like" && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-950/35 px-4 py-3 text-sm text-emerald-50 shadow-sm ring-1 ring-emerald-500/10"
          >
            <p className="text-[15px] font-bold leading-snug">Intérêt envoyé</p>
            <p className="mt-1 text-[13px] leading-snug text-emerald-100/90">
              Match réciproque ? Proposez vite un moment pour bouger ensemble.
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
              C’est un match
            </p>
            <p className="mt-1 text-[13px] font-medium leading-snug text-app-text">
              Ouvrez la messagerie et proposez un moment concret.
            </p>
          </div>
        )}

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

        {!loading && !errorMessage && profiles.length === 0 && (
          <div className="rounded-2xl border border-[#E11D2E]/10 bg-app-card px-5 py-8 text-center shadow-sm ring-1 ring-app-border">
            <p className="text-base font-semibold leading-snug text-app-text">En attendant…</p>
            <p className="mx-auto mt-2 max-w-[18rem] text-sm leading-relaxed text-app-muted">
              Affinez vos rencontres avec SPLove+
            </p>
            <button
              type="button"
              onClick={() => navigate("/splove-plus")}
              className="mt-4 rounded-xl border border-app-border px-4 py-2.5 text-[13px] font-semibold text-app-text transition hover:bg-app-border"
            >
              Voir SPLove+
            </button>
          </div>
        )}

        {!loading && !errorMessage && weeklySuggestions.length > 0 && (
          <div className="mb-5">
            <PremiumSuggestionsSection
              title="Le match parfait ?"
              subtitle="Trois profils très alignés avec vous."
              items={weeklySuggestions.map((p) => {
                const cs = firstCommonSportName(p, mySportMatchKeys);
                return {
                  id: p.id,
                  photoUrl: getProfileDisplayPhotoUrl(p),
                  firstName: p.first_name?.trim() || "Profil",
                  age: getAgeFromBirthDate(p.birth_date ?? null),
                  commonSport: cs ?? "",
                  projectionCopy: cs ? `Envie de bouger sur ${cs} ?` : "Ouvrez pour proposer un moment.",
                  verified: isPhotoVerified(p),
                };
              })}
              ctaLabel="Voir"
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

        {!loading &&
          !errorMessage &&
          profiles.map((profile) => (
            <DiscoverSwipeCard
              key={profile.id}
              profile={profile}
              mySportMatchKeys={mySportMatchKeys}
              discoverMenuProfileId={discoverMenuProfileId}
              setDiscoverMenuProfileId={setDiscoverMenuProfileId}
              onPass={handlePass}
              onLike={handleLike}
              onOpenDetail={handleViewProfileFromSuggestion}
              onReport={setReportProfileId}
              onBlock={handleBlock}
            />
          ))}

        <section
          className="mb-2 mt-1 rounded-xl border border-app-border/50 bg-app-bg/50 px-3 py-3 ring-1 ring-white/[0.03]"
          aria-label="Option SPLove+"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-app-muted">
            Option SPLove+
          </p>
          <p className="mt-1 text-[13px] font-medium leading-snug text-app-text">
            Passe du match au réel, sans attendre.
          </p>
          <p className="mt-1 text-[12px] leading-snug text-app-muted">
            Propose une activité. On te rend visible au bon moment, au bon endroit.
          </p>
          <ul className="mt-2 space-y-0.5 text-[11px] leading-snug text-app-muted">
            <li>Ta proposition passe en priorité</li>
            <li>Tu rencontres plus vite, pour de vrai</li>
          </ul>
          <Link
            to="/splove-plus"
            className="mt-2.5 block w-full rounded-lg border border-app-border/80 bg-app-card/60 py-1.5 text-center text-[11px] font-semibold text-app-text transition hover:bg-app-border/80"
          >
            Passer au réel maintenant
          </Link>
        </section>
      </main>

      {previewProfile
        ? (() => {
            const profile = previewProfile;
            const photoMain = getProfileDisplayPhotoUrl(profile) ?? "";
            const photoSecond = getSecondaryPhotoUrl(profile);
            const age = getAgeFromBirthDate(profile.birth_date ?? null);
            const sharedSports = getSharedSportsFromProfile(mySportMatchKeys, profile);
            const intentLine = intentShortLabel(profile.intent);
            const lf = profile.looking_for?.trim();
            return (
              <div
                className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
                role="presentation"
                onClick={() => setPreviewProfile(null)}
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
                          className="absolute inset-0 h-full w-full object-cover"
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
                          aria-label="Plus d’actions"
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
                              onClick={() => void handleBlock(profile.id)}
                            >
                              <IconBanSoft size={18} className="shrink-0 text-app-muted" />
                              {BLOCK_PROFILE_LINK_LABEL}
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
                          className="absolute inset-0 h-full w-full object-cover"
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
                        {profile.first_name ?? "Sans prénom"}
                        {age != null ? <span className="font-semibold text-app-muted">, {age}</span> : null}
                      </h2>
                      {isPhotoVerified(profile) ? <VerifiedBadge /> : null}
                    </div>
                    {sharedSports.length > 0 ? (
                      <div className="flex max-h-[4.5rem] flex-wrap gap-1.5 overflow-hidden">
                        {sharedSports.map((name) => (
                          <span
                            key={name}
                            className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200/90"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="space-y-1 text-[13px] leading-snug text-app-muted">
                      {intentLine ? <p className="line-clamp-1">{intentLine}</p> : null}
                      {lf ? (
                        <p className="line-clamp-1">
                          <span className="font-medium text-app-muted">Cherche </span>
                          {lf}
                        </p>
                      ) : null}
                      {profile.city ? (
                        <p className="line-clamp-1 text-[12px] text-app-muted">{profile.city}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="mt-1 w-full rounded-2xl py-4 text-base font-bold shadow-lg transition hover:opacity-95 sm:py-4 sm:text-[17px]"
                      style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
                      onClick={() => void handlePreviewLike()}
                    >
                      Proposer un moment
                    </button>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
                      <button
                        type="button"
                        className="rounded-full px-2 py-1.5 text-xs font-medium text-app-muted hover:bg-app-border hover:text-app-muted"
                        onClick={() => setPreviewProfile(null)}
                      >
                        Fermer
                      </button>
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium text-app-muted hover:bg-app-border hover:text-app-muted"
                        onClick={() => {
                          handlePass(profile.id);
                          setPreviewProfile(null);
                        }}
                      >
                        <IconPass size={16} />
                        Pass
                      </button>
                      <button
                        type="button"
                        className="group flex items-center gap-1 rounded-full border border-app-border bg-app-card px-2.5 py-1.5 text-xs font-semibold text-app-text shadow-sm hover:bg-app-border"
                        onClick={() => void handlePreviewLike()}
                      >
                        <IconHeartOutline
                          size={16}
                          color="#FF1E2D"
                          className="transition-opacity group-active:opacity-60"
                        />
                        Like
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()
        : null}

      {reportProfileId && currentUserId && (
        <ReportModal
          reportedProfileId={reportProfileId}
          reporterId={currentUserId}
          onClose={() => setReportProfileId(null)}
        />
      )}
    </div>
  );
}
