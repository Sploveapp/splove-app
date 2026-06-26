import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ensureProfileRowForAuthUserId } from "../lib/authProfileSync";
import { isNativeCapacitorApp } from "../lib/authRedirect";
import {
  AUTH_BOOTSTRAP_MAX_MS,
  AUTH_PROFILE_BOOTSTRAP_MAX_MS,
  AUTH_PROFILE_FETCH_MAX_ATTEMPTS,
  PROFILE_FETCH_FAST_MS,
  PROFILE_LOAD_TIERS_FAST_AUTH,
  mergeOptionalProfileFields,
  selectProfilesFirstMatch,
} from "../lib/profileSelect";
import {
  isRedundantSessionRefreshEvent,
  isRetryableNetworkError,
  sameAuthUserId,
} from "../lib/authNetwork";
import { mergeAdaptedOpennessFields } from "../lib/profileAdaptedOpenness";
import { registerAuthSessionSyncHandler } from "../lib/authSessionSyncBridge";
import {
  mergeAuthProfileRow,
  mergeProfileScreenRowPreservingPhotos,
} from "../lib/profileScreenHydrate";
import { deferSecondaryWork } from "../lib/deferSecondaryWork";
import { resolveAppShellState, type AppShellState } from "../lib/appShellState";
import type { AppProfile } from "../lib/appProfile";
import { isProfileRecord } from "../lib/appProfile";
import { isProfileReadyForDiscover } from "../lib/onboardingDiscoverReadiness";
import { DISCOVER_BETA_SIMPLE_PIPELINE } from "../lib/discoverBetaPipeline";

import type { User, Session } from "@supabase/supabase-js";
import { clearAllOAuthSessionLocks, isOAuthCallbackInProgress, isOauthProcessingLocked } from "../lib/oauthCallbackLock";
import { formatAuthStateChangeLog } from "../lib/oauthLogSanitize";
import { tryExitOAuthLoadingAfterProfileReady } from "../lib/oauthProfileReadyExit";
import {
  logOAuthSessionReceived,
  logOAuthUserReceived,
} from "../lib/oauthSessionRecoveryDiag";

export type Profile = {
  id: string;
  first_name: string | null;
  birth_date?: string | null;
  gender?: string | null;
  looking_for?: string | null;
  meet_pref?: string | null;
  intent?: string | null;
  accepted_terms_at?: string | null;
  accepted_privacy_at?: string | null;
  portrait_url?: string | null;
  fullbody_url?: string | null;
  main_photo_url?: string | null;
  profile_completed: boolean;
  /** Voir migration `008_profiles_photo_verification` — mis à jour via Veriff / équipe. */
  is_photo_verified?: boolean | null;
  /** Détail par photo — migration `043_profile_photo_validation_statuses`. */
  portrait_photo_status?: string | null;
  body_photo_status?: string | null;
  photo_status?: string | null;
  identity_verified?: boolean | null;
  veriff_status?: string | null;
  portrait_rejection_code?: string | null;
  body_rejection_code?: string | null;
  /** Âge préféré pour Discover — migrations `101_profiles_preferred_age_range.sql`. */
  preferred_age_min?: number | null;
  preferred_age_max?: number | null;
  /** Modération automatique (slots 1 = portrait, 2 = corps) — migration 058. */
  photo1_status?: string | null;
  photo2_status?: string | null;
  photo_moderation_overall?: string | null;
  is_under_review?: boolean | null;
  moderation_strikes_count?: number | null;
  /** Activités adaptées — optionnel, voir migrations 005, 094. */
  needs_adapted_activities?: boolean | null;
  /** Ouverture à une pratique adaptée (codes onboarding), migration 094. */
  open_to_adapted_activities?: string | null;
  [key: string]: unknown;
};

type AuthState = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isProfileComplete: boolean;
  profileIncompleteReason: string | null;
  /** True after the first bootstrap (getSession + optional OAuth wait) — distinct from « no user ». */
  isAuthInitialized: boolean;
  isLoading: boolean;
  /** True while the initial / refetch of `profile` is in flight. Never used for session/auth. */
  isProfileLoading: boolean;
  /** True après le premier fetch profil terminé (succès ou absence confirmée). */
  profileBootstrapSettled: boolean;
  error: string | null;
  /** Recharge le profil depuis Supabase ; n’efface pas le profil en cache si la lecture échoue. */
  /** État shell global (splash / skeleton / contenu). */
  appShell: AppShellState;
  refetchProfile: () => Promise<Profile | null>;
  /** Met à jour le profil depuis une ligne serveur (ex. retour d’upsert onboarding), avec flushSync. */
  commitProfileRow: (row: unknown) => void;
  /** Re-lit la session Supabase et met à jour `user` / `session` de façon synchrone. Retourne false si aucun utilisateur. */
  syncAuthSession: () => Promise<boolean>;
  isSigningOut: boolean;
  signOut: (options?: { scope?: "global" | "local" | "others" }) => Promise<void>;
  retryProfileLoad: () => void;
  profileLoadError: string | null;
};

const AuthContext = createContext<AuthState | null>(null);

/** Même promesse : sync session client (getSession) dans `syncAuthSession`. */
const SESSION_SYNC_RACE_MS = 6_000;

function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  return new Promise((resolve) => {
    const t = window.setTimeout(() => resolve("timeout"), ms);
    void promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      () => {
        window.clearTimeout(t);
        resolve("timeout");
      },
    );
  });
}

function profileRowToProfile(row: AppProfile): Profile {
  return {
    ...row,
    profile_completed: row.profile_completed === true,
    is_photo_verified: !!(row as { is_photo_verified?: boolean | null }).is_photo_verified,
  } as Profile;
}

/**
 * Lecture `profiles` en cascade (tiers) : schéma Render partiel → pas de 400 bloquant,
 * la décision auth repose sur un noyau présent dans les paliers bas (flags + id).
 */
async function fetchProfileCore(
  userId: string,
  tiers: string[],
  logLabel: string,
): Promise<Profile | null> {
  const runTiers = () => selectProfilesFirstMatch(supabase, userId, tiers, logLabel);

  let { data, usedSelect, lastError } = await runTiers();

  if (!data) {
    const created = await ensureProfileRowForAuthUserId(userId);
    if (created) {
      const again = await runTiers();
      data = again.data;
      usedSelect = again.usedSelect;
      lastError = again.lastError;
    }
  }

  if (!data) {
    if (import.meta.env.DEV) {
      console.log("[PROFILE_CORE_LOAD_FAILED]", {
        context: "[AuthContext] fetchProfile",
        userId: userId.slice(0, 8) + "…",
        message: lastError?.message ?? "no_row",
        code: lastError?.code ?? null,
      });
    }
    console.warn("[AuthContext] fetchProfile: no row after cascade", {
      lastError: lastError?.message ?? null,
      code: lastError?.code ?? null,
    });
    return null;
  }

  if (import.meta.env.DEV) {
    console.log("[PROFILE_CORE_LOAD_OK]", {
      context: "[AuthContext] fetchProfile",
      userId: userId.slice(0, 8) + "…",
    });
  }

  console.debug("[AuthContext] fetchProfile tier used", {
    usedSelectSample: usedSelect ? usedSelect.slice(0, 100) + (usedSelect.length > 100 ? "…" : "") : null,
  });

  if (!isProfileRecord(data)) {
    if (import.meta.env.DEV) {
      console.log("[PROFILE_CORE_LOAD_FAILED]", {
        context: "[AuthContext] fetchProfile invalid row shape",
        userId: userId.slice(0, 8) + "…",
      });
    }
    console.warn("[AuthContext] fetchProfile: unexpected profile row shape");
    return null;
  }

  return profileRowToProfile(data as AppProfile);
}

async function enrichProfileOptionalFields(userId: string, base: Profile): Promise<Profile> {
  try {
    const raced = await Promise.race([
      Promise.all([
        mergeOptionalProfileFields(supabase, userId),
        mergeAdaptedOpennessFields(supabase, userId),
      ]),
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), 2_000);
      }),
    ]);
    if (raced === null) {
      console.warn("[AuthContext] enrichProfileOptionalFields timeout — skipped");
      return base;
    }
    const [extra, adapted] = raced;
    const merged = { ...base };
    if (extra && typeof extra === "object") {
      Object.assign(merged, extra);
    }
    if (adapted && typeof adapted === "object") {
      Object.assign(merged, adapted);
    }
    return merged;
  } catch (e) {
    console.warn("[AuthContext] enrichProfileOptionalFields error — skipped", e);
    return base;
  }
}

async function fetchProfileFastWithTimeout(userId: string): Promise<Profile | null> {
  const raced = await Promise.race([
    fetchProfileCore(userId, PROFILE_LOAD_TIERS_FAST_AUTH, "[AuthContext] fetchProfile fast"),
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), PROFILE_FETCH_FAST_MS);
    }),
  ]);
  return raced;
}

async function fetchProfileFastWithRetry(userId: string): Promise<Profile | null> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= AUTH_PROFILE_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const row = await fetchProfileFastWithTimeout(userId);
      if (row?.id) return row;
    } catch (e) {
      lastErr = e;
      if (!isRetryableNetworkError(e) || attempt >= AUTH_PROFILE_FETCH_MAX_ATTEMPTS) {
        throw e;
      }
      console.warn("[AuthContext] profile fetch retry", { attempt, userId: userId.slice(0, 8) });
      await new Promise((r) => window.setTimeout(r, 600));
      continue;
    }
    if (attempt < AUTH_PROFILE_FETCH_MAX_ATTEMPTS) {
      await new Promise((r) => window.setTimeout(r, 400));
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileBootstrapSettled, setProfileBootstrapSettled] = useState(false);
  /** Incrémenté à chaque loadProfile — ignore les réponses obsolètes. */
  const profileLoadGenRef = useRef(0);
  /** Évite les fetch profil concurrents / boucles. */
  const fetchProfileInFlightRef = useRef(false);
  /** Dernier utilisateur pour lequel un profil non vide a été chargé avec succès (garde boucle session). */
  const lastLoadedUserIdRef = useRef<string | null>(null);
  /** Copie synchrone de `profile` pour les gardes dans les effets (évite re-fetch si déjà OK). */
  const profileRef = useRef<Profile | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const signOutInFlightRef = useRef(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    console.log("[AuthContext] global loading", isLoading ? "start" : "end");
  }, [isLoading]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const loadProfile = useCallback((userId: string) => {
    if (!userId) {
      setIsProfileLoading(false);
      setProfile(null);
      lastLoadedUserIdRef.current = null;
      return;
    }
    if (fetchProfileInFlightRef.current) return;

    fetchProfileInFlightRef.current = true;
    const gen = ++profileLoadGenRef.current;
    setProfileBootstrapSettled(false);
    setIsProfileLoading(false);

    void (async () => {
      try {
        const fast = await fetchProfileFastWithRetry(userId);
        if (gen !== profileLoadGenRef.current) return;

        if (fast?.id) {
          setProfileLoadError(null);
          lastLoadedUserIdRef.current = fast.id;
          setProfile((prev) =>
            profileRowToProfile(
              mergeAuthProfileRow(
                prev as Record<string, unknown> | null,
                fast as unknown as Record<string, unknown>,
              ) as AppProfile,
            ),
          );
          console.log("AUTH_PROFILE_READY", { userId: fast.id.slice(0, 8) });
          void tryExitOAuthLoadingAfterProfileReady(
            fast as unknown as Record<string, unknown>,
            userId,
          );
        }
        if (!DISCOVER_BETA_SIMPLE_PIPELINE && fast?.id) {
          deferSecondaryWork(() => {
            void enrichProfileOptionalFields(userId, fast)
              .then((enriched) => {
                if (gen !== profileLoadGenRef.current) return;
                setProfile((prev) =>
                  profileRowToProfile(
                    mergeAuthProfileRow(
                      prev as Record<string, unknown> | null,
                      enriched as unknown as Record<string, unknown>,
                    ) as AppProfile,
                  ),
                );
              })
              .catch(() => undefined);
          }, 5_000);
        }
      } catch (e) {
        console.warn("[AuthContext] profile load error", e);
      } finally {
        fetchProfileInFlightRef.current = false;
        setProfileBootstrapSettled(true);
        setIsProfileLoading(false);
      }
    })();
  }, []);

  const commitProfileRow = useCallback((row: unknown) => {
    if (!isProfileRecord(row)) {
      console.error("[AuthContext] commitProfileRow: valeur invalide (pas un profil)", row);
      return;
    }
    const normalized = profileRowToProfile(row);
    if (normalized.id) {
      lastLoadedUserIdRef.current = normalized.id;
    }
    flushSync(() => {
      setProfile((prev) => {
        if (!prev?.id || prev.id !== normalized.id) {
          return normalized;
        }
        const merged = mergeProfileScreenRowPreservingPhotos(
          prev as Record<string, unknown>,
          normalized as Record<string, unknown>,
        );
        return profileRowToProfile(merged as AppProfile);
      });
    });
  }, []);

  const refetchProfile = useCallback(async (): Promise<Profile | null> => {
    if (!user?.id) return null;
    if (fetchProfileInFlightRef.current) {
      if (import.meta.env.DEV) {
        console.log("[AuthContext] fetchProfile skipped in-flight");
      }
      return null;
    }
    fetchProfileInFlightRef.current = true;
    setProfileBootstrapSettled(false);
    setIsProfileLoading(true);
    try {
      const p = await fetchProfileFastWithTimeout(user.id);
      if (p?.id) {
        lastLoadedUserIdRef.current = p.id;
      }
      if (p) {
        flushSync(() => {
          setProfile((prev) =>
            profileRowToProfile(
              mergeAuthProfileRow(
                prev as Record<string, unknown> | null,
                p as unknown as Record<string, unknown>,
              ) as AppProfile,
            ),
          );
        });
      } else if (import.meta.env.DEV) {
        console.log("[PROFILE_CORE_LOAD_FAILED]", {
          context: "[AuthContext] refetchProfile — keeping cached profile",
          userId: user.id.slice(0, 8) + "…",
        });
      }
      return p;
    } catch (e) {
      console.warn("[AuthContext] refetchProfile error", e);
      throw e;
    } finally {
      fetchProfileInFlightRef.current = false;
      setProfileBootstrapSettled(true);
      setIsProfileLoading(false);
    }
  }, [user?.id]);

  const syncAuthSession = useCallback(async (): Promise<boolean> => {
    const r = await raceWithTimeout(supabase.auth.getSession(), SESSION_SYNC_RACE_MS);
    if (r === "timeout") {
      console.warn("[AuthContext] syncAuthSession: getSession timeout", SESSION_SYNC_RACE_MS, "ms");
      flushSync(() => {
        setIsLoading(false);
        setIsAuthInitialized(true);
      });
      return false;
    }
    const {
      data: { session: next },
    } = r;
    flushSync(() => {
      setSession(next);
      setUser(next?.user ?? null);
      setIsLoading(false);
      setIsAuthInitialized(true);
    });
    return Boolean(next?.user?.id);
  }, []);

  useEffect(() => {
    registerAuthSessionSyncHandler(syncAuthSession);
    return () => registerAuthSessionSyncHandler(null);
  }, [syncAuthSession]);

  const signOut = useCallback(async (options?: { scope?: "global" | "local" | "others" }) => {
    if (signOutInFlightRef.current) {
      console.log("[Logout] skipped duplicate");
      return;
    }
    signOutInFlightRef.current = true;
    setIsSigningOut(true);
    console.log("[Logout] start");
    setError(null);

    profileLoadGenRef.current += 1;
    fetchProfileInFlightRef.current = false;
    lastLoadedUserIdRef.current = null;
    flushSync(() => {
      setUser(null);
      setSession(null);
      setProfile(null);
      setIsProfileLoading(false);
      setProfileBootstrapSettled(false);
      setIsLoading(false);
      setIsAuthInitialized(true);
    });
    console.log("[Logout] local state cleared");
    clearAllOAuthSessionLocks();

    try {
      const { error: signOutError } = await supabase.auth.signOut(options);
      if (signOutError) {
        console.error("[Logout] signOut error", signOutError);
        setError(signOutError.message);
        return;
      }
      console.log("[Logout] signOut done");
      navigate("/", { replace: true });
      console.log("[Logout] redirected /");
    } catch (e) {
      console.error("[Logout] error", e);
    } finally {
      signOutInFlightRef.current = false;
      setIsSigningOut(false);
    }
  }, [navigate]);

  const retryProfileLoad = useCallback(() => {
    const uid = sessionRef.current?.user?.id;
    if (!uid) return;
    setProfileLoadError(null);
    lastLoadedUserIdRef.current = null;
    loadProfile(uid);
  }, [loadProfile]);

  /**
   * Session: une seule init (getSession) + un seul onAuthStateChange.
   * `isLoading` repasse jamais true pour le profil — le profil se charge en arrière-plan.
   */
  useEffect(() => {
    let mounted = true;

    async function init() {
      console.log("AUTH_INIT_START");
      setError(null);
      try {
        if (isOAuthCallbackInProgress()) {
          console.log("[AuthContext] init deferred — OAuth callback in progress");
          const raced = await raceWithTimeout(supabase.auth.getSession(), 2_000);
          if (raced !== "timeout") {
            const { data: early, error: earlyErr } = raced;
            if (!earlyErr && early.session?.user?.id) {
              console.log("AUTH_SESSION_READY", {
                userId: early.session.user.id.slice(0, 8),
              });
              console.log("AUTH_SESSION_RESTORED", {
                userId: early.session.user.id.slice(0, 8),
                source: "oauth_init_getSession",
              });
              sessionRef.current = early.session;
              setSession(early.session);
              setUser(early.session.user);
            }
          }
          return;
        }
        const sessionTimeoutMs = isNativeCapacitorApp() ? 5_000 : AUTH_BOOTSTRAP_MAX_MS;
        const raced = await raceWithTimeout(supabase.auth.getSession(), sessionTimeoutMs);
        if (!mounted) return;
        if (raced === "timeout") {
          console.warn("[AuthContext] getSession timeout", AUTH_BOOTSTRAP_MAX_MS);
          return;
        }
        const { data, error: sessionError } = raced;
        if (sessionError) {
          console.error("[AuthContext] getSession error:", sessionError);
          setError(sessionError.message);
          setSession(null);
          setUser(null);
          sessionRef.current = null;
          return;
        }
        if (data.session?.user?.id) {
          console.log("AUTH_SESSION_READY", {
            userId: data.session.user.id.slice(0, 8),
          });
          console.log("AUTH_SESSION_RESTORED", {
            userId: data.session.user.id.slice(0, 8),
            source: "getSession",
          });
        } else {
          console.log("AUTH_NO_SESSION");
        }
        sessionRef.current = data.session;
        setSession(data.session);
        setUser(data.session?.user ?? null);
      } finally {
        if (mounted) {
          setIsLoading(false);
          setIsAuthInitialized(true);
        }
      }
    }

    void init();

    const bootstrapSafetyTimer = window.setTimeout(() => {
      if (!mounted) return;
      setIsLoading(false);
      setIsAuthInitialized(true);
      setIsProfileLoading(false);
      fetchProfileInFlightRef.current = false;
    }, AUTH_BOOTSTRAP_MAX_MS);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      console.log("[AuthContext] state change", formatAuthStateChangeLog(event, nextSession));
      if (!mounted) return;

      if (isOauthProcessingLocked() && !nextSession?.user?.id) {
        console.log("[AuthContext] ignore null session during oauth lock", event);
        return;
      }

      const prevSession = sessionRef.current;
      if (isRedundantSessionRefreshEvent(event, prevSession, nextSession)) {
        sessionRef.current = nextSession;
        if (prevSession?.access_token !== nextSession?.access_token) {
          setSession(nextSession);
        }
        console.log("[AuthContext] skip redundant session refresh", { event });
        return;
      }

      if (event === "INITIAL_SESSION" && !nextSession) {
        if (isOAuthCallbackInProgress()) {
          console.log("[AuthContext] ignore INITIAL_SESSION null during OAuth callback");
          return;
        }
        if (sessionRef.current?.user?.id) {
          console.log("[AuthContext] ignore INITIAL_SESSION null — session already present");
          return;
        }
      }

      if (event === "SIGNED_OUT") {
        if (isOauthProcessingLocked()) {
          console.log("[AuthContext] ignore SIGNED_OUT during oauth lock");
          return;
        }
        console.log("[AuthContext] SIGNED_OUT");
        console.log("AUTH_NO_SESSION");
        profileLoadGenRef.current += 1;
        fetchProfileInFlightRef.current = false;
        lastLoadedUserIdRef.current = null;
        sessionRef.current = null;
        flushSync(() => {
          setSession(null);
          setUser(null);
          setProfile(null);
          setIsProfileLoading(false);
          setError(null);
        });
        setIsLoading(false);
        console.log("[AuthContext] loading false");
        return;
      }

      sessionRef.current = nextSession;
      const nextUid = nextSession?.user?.id ?? null;
      const prevUid = prevSession?.user?.id ?? null;
      if (sameAuthUserId(prevSession, nextSession)) {
        if (prevSession?.access_token !== nextSession?.access_token) {
          setSession(nextSession);
        }
        setError(null);
        setIsLoading(false);
        setIsAuthInitialized(true);
        return;
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setError(null);
      if (nextUid && nextUid !== prevUid) {
        lastLoadedUserIdRef.current = null;
      }
      if (nextSession?.user?.id) {
        console.log("AUTH_SESSION_READY", {
          userId: nextSession.user.id.slice(0, 8),
          event,
        });
        logOAuthSessionReceived("onAuthStateChange", nextSession, null);
        logOAuthUserReceived("onAuthStateChange", nextSession.user, null);
        if (event === "SIGNED_IN") {
          console.log("[OAuthRecovery/onAuthStateChange] OAUTH_SUCCESS", { event });
        }
        setIsLoading(false);
        setIsAuthInitialized(true);
      }
    });

    return () => {
      mounted = false;
      window.clearTimeout(bootstrapSafetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) {
      lastLoadedUserIdRef.current = null;
      setIsProfileLoading(false);
      setProfile(null);
      return;
    }

    if (
      lastLoadedUserIdRef.current === uid &&
      profileRef.current?.id === uid
    ) {
      if (import.meta.env.DEV) {
        console.log("[AuthContext] fetchProfile skipped same user");
      }
      setIsProfileLoading(false);
      return;
    }

    setIsProfileLoading(false);
    loadProfile(uid);
  }, [session?.user?.id, loadProfile]);

  /** Ne jamais bloquer Discover sur un enrichissement optionnel / fetch lent. */
  useEffect(() => {
    if (!session?.user?.id || !isProfileLoading) return;
    const timer = window.setTimeout(() => {
      console.warn("[AuthContext] profile load safety timeout", {
        ms: AUTH_PROFILE_BOOTSTRAP_MAX_MS,
      });
      fetchProfileInFlightRef.current = false;
      setIsProfileLoading(false);
    }, AUTH_PROFILE_BOOTSTRAP_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [session?.user?.id, isProfileLoading]);

  const ghostProfileLoggedRef = useRef<string | null>(null);

  /** Garde navigation : drapeaux BDD d’abord, puis audit données si besoin. */
  const isProfileComplete = useMemo(() => {
    if (profile == null || typeof profile.id !== "string" || profile.id.length === 0) {
      return false;
    }
    const row = profile as unknown as Record<string, unknown>;
    if (profile.profile_completed === true) return true;
    if (row.onboarding_completed === true) return true;
    if (row.onboarding_done === true) return true;

    const sportsCount = Number(row.onboarding_sports_count ?? 0);
    return isProfileReadyForDiscover(
      row,
      Number.isFinite(sportsCount) ? sportsCount : 0,
    );
  }, [profile]);

  const profileIncompleteReason = isProfileComplete ? null : "profile_not_completed";

  const appShell = useMemo(
    (): AppShellState =>
      resolveAppShellState({
        isAuthInitialized,
        isLoading,
        sessionUserId: session?.user?.id,
        profileId: profile?.id,
      }),
    [isAuthInitialized, isLoading, session?.user?.id, profile?.id],
  );

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid || profile?.id !== uid) return;
    void tryExitOAuthLoadingAfterProfileReady(profile as unknown as Record<string, unknown>, uid);
  }, [session?.user?.id, profile]);

  useEffect(() => {
    if (!import.meta.env.DEV || profile == null) return;
    if (profile.profile_completed !== true || isProfileComplete) return;
    if (ghostProfileLoggedRef.current === profile.id) return;
    ghostProfileLoggedRef.current = profile.id;
    console.warn("[AuthContext] ghost profile detected — profile_completed true but audit failed", {
      profile_id: profile.id,
      gender: profile.gender ?? null,
      looking_for: (profile as { looking_for?: unknown }).looking_for ?? null,
      city: (profile as { city?: unknown }).city ?? null,
      latitude: (profile as { latitude?: unknown }).latitude ?? null,
      longitude: (profile as { longitude?: unknown }).longitude ?? null,
    });
  }, [profile, isProfileComplete]);

  const value: AuthState = {
    user,
    session,
    profile,
    isProfileComplete,
    profileIncompleteReason,
    isAuthInitialized,
    isLoading,
    isProfileLoading,
    profileBootstrapSettled,
    appShell,
    error,
    refetchProfile,
    commitProfileRow,
    syncAuthSession,
    isSigningOut,
    signOut,
    retryProfileLoad,
    profileLoadError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return ctx;
}