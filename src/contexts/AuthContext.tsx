import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { supabase } from "../lib/supabase";
import { ensureProfileRowForAuthUserId } from "../lib/authProfileSync";
import {
  PROFILE_LOAD_TIERS_FOR_AUTH,
  selectProfilesFirstMatch,
} from "../lib/profileSelect";
import type { AppProfile } from "../lib/appProfile";
import { isProfileRecord } from "../lib/appProfile";

import type { User, Session } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  first_name: string | null;
  birth_date?: string | null;
  gender?: string | null;
  looking_for?: string | null;
  intent?: string | null;
  portrait_url?: string | null;
  fullbody_url?: string | null;
  main_photo_url?: string | null;
  profile_completed: boolean;
  /** Voir migration `008_profiles_photo_verification` — mis à jour via Veriff / équipe. */
  is_photo_verified?: boolean | null;
  /** Détail par photo — migration `043_profile_photo_validation_statuses`. */
  portrait_photo_status?: string | null;
  body_photo_status?: string | null;
  /** Globale — badge « vérifié » : `photo_status === 'approved'` (exposé par `feed_profiles`). */
  photo_status?: string | null;
  portrait_rejection_code?: string | null;
  body_rejection_code?: string | null;
  /** Modération automatique (slots 1 = portrait, 2 = corps) — migration 058. */
  photo1_status?: string | null;
  photo2_status?: string | null;
  photo_moderation_overall?: string | null;
  is_under_review?: boolean | null;
  moderation_strikes_count?: number | null;
  /** Activités adaptées — optionnel, voir migration 005 / 041. */
  needs_adapted_activities?: boolean | null;
  [key: string]: unknown;
};

type AuthState = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isProfileComplete: boolean;
  /** True after the first bootstrap (getSession + optional OAuth wait) — distinct from « no user ». */
  isAuthInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  /** Recharge le profil depuis Supabase ; n’efface pas le profil en cache si la lecture échoue. */
  refetchProfile: () => Promise<Profile | null>;
  /** Met à jour le profil depuis une ligne serveur (ex. retour d’upsert onboarding), avec flushSync. */
  commitProfileRow: (row: unknown) => void;
  /** Re-lit la session Supabase et met à jour `user` / `session` de façon synchrone. Retourne false si aucun utilisateur. */
  syncAuthSession: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/** Évite un `isLoading` infini si getSession / fetch profil ne se termine jamais. */
const AUTH_INIT_WATCHDOG_MS = 25_000;
/** Première fenêtre pour getSession — si dépassée, on attend encore la même promesse (pas de reset user trop tôt). */
const GET_SESSION_SOFT_MS = 12_000;
/** Filet dur après le soft timeout (même promesse getSession). */
const GET_SESSION_HARD_EXTRA_MS = 20_000;
/** Chargement profil (init + onAuthStateChange) — timeout ≠ session invalide. */
const PROFILE_LOAD_RACE_MS = 12_000;
/** Après redirect OAuth, `getSession()` peut être vide un court instant — on attend l’échange. */
const OAUTH_CALLBACK_WAIT_MS = 12_000;
const OAUTH_CALLBACK_POLL_MS = 80;

function oauthCallbackLikely(): boolean {
  if (typeof window === "undefined") return false;
  const { hash, search } = window.location;
  return /(?:^|[?#&])(?:code|access_token|refresh_token)=/.test(hash + search);
}

async function waitForOAuthSessionIfNeeded(
  hadSession: boolean,
): Promise<Awaited<ReturnType<typeof supabase.auth.getSession>> | null> {
  if (hadSession || !oauthCallbackLikely()) return null;
  console.log("[AuthContext] OAuth callback params detected — waiting for session exchange");
  const deadline = Date.now() + OAUTH_CALLBACK_WAIT_MS;
  while (Date.now() < deadline) {
    const r = await supabase.auth.getSession();
    if (r.data.session?.user) {
      console.log("[AuthContext] OAuth wait: session available", {
        userId: r.data.session.user.id.slice(0, 8) + "…",
      });
      return r;
    }
    await new Promise((res) => setTimeout(res, OAUTH_CALLBACK_POLL_MS));
  }
  console.warn("[AuthContext] OAuth wait: timeout (still no session)");
  return null;
}

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

type GetSessionResult = Awaited<ReturnType<typeof supabase.auth.getSession>>;

/**
 * Ne pas traiter un « timeout » court comme absence de session : la promesse native peut encore résoudre.
 */
async function resolveGetSession(): Promise<GetSessionResult | "hard-timeout"> {
  const sessionPromise = supabase.auth.getSession();
  let first = await raceWithTimeout(sessionPromise, GET_SESSION_SOFT_MS);
  if (first === "timeout") {
    console.warn(
      "[AuthContext] getSession soft timeout — awaiting same promise (hard window)",
      GET_SESSION_HARD_EXTRA_MS,
      "ms",
    );
    first = await raceWithTimeout(sessionPromise, GET_SESSION_HARD_EXTRA_MS);
  }
  if (first === "timeout") {
    console.error("[AuthContext] getSession hard timeout — no session");
    return "hard-timeout";
  }
  return first;
}

function profileRowToProfile(row: AppProfile): Profile {
  const onboardingCompleted = (row as { onboarding_completed?: unknown }).onboarding_completed === true;
  const canonicalProfileCompleted = row.profile_completed === true || onboardingCompleted;
  return {
    ...row,
    profile_completed: canonicalProfileCompleted,
    is_photo_verified: !!(row as { is_photo_verified?: boolean | null }).is_photo_verified,
  } as Profile;
}

/**
 * Lecture `profiles` en cascade (tiers) : schéma Render partiel → pas de 400 bloquant,
 * la décision auth repose sur un noyau présent dans les paliers bas (flags + id).
 */
async function fetchProfile(userId: string): Promise<Profile | null> {
  const runTiers = () =>
    selectProfilesFirstMatch(supabase, userId, PROFILE_LOAD_TIERS_FOR_AUTH, "[AuthContext] fetchProfile");

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
    console.warn("[AuthContext] fetchProfile: no row after cascade", {
      lastError: lastError?.message ?? null,
      code: lastError?.code ?? null,
    });
    return null;
  }

  console.debug("[AuthContext] fetchProfile tier used", {
    usedSelectSample: usedSelect ? usedSelect.slice(0, 100) + (usedSelect.length > 100 ? "…" : "") : null,
  });

  if (!isProfileRecord(data)) {
    console.warn("[AuthContext] fetchProfile: unexpected profile row shape");
    return null;
  }

  const normalized = profileRowToProfile(data as AppProfile);
  const onboardingCompleted = (data as { onboarding_completed?: unknown }).onboarding_completed === true;
  if (normalized.profile_completed && data.profile_completed !== true && onboardingCompleted) {
    console.debug("[AuthContext] backfill profile_completed from onboarding_completed", {
      userId: userId.slice(0, 8) + "…",
      profile_completed: data.profile_completed,
      onboarding_completed: onboardingCompleted,
    });
    void supabase
      .from("profiles")
      .update({ profile_completed: true, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .then(({ error: backfillError }) => {
        if (backfillError) {
          console.warn("[AuthContext] backfill profile_completed failed:", backfillError.message);
        }
      });
  }

  return normalized;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Permet à `INITIAL_SESSION` de ne pas doubler le chargement profil pendant `init()`. */
  const initDoneRef = useRef(false);

  /** Incrémenté à chaque loadProfile — ignore les réponses obsolètes (courses onAuthStateChange). */
  const profileLoadGenRef = useRef(0);
  /** Évite les fetch profil concurrents / boucles. */
  const fetchProfileInFlightRef = useRef(false);

  /** État précédent pour éviter un second `SIGNED_IN` (doublon Supabase / reconnexion) qui remet toute l’app en « Chargement… ». */
  const sessionGateRef = useRef<{ userId: string | null; hasProfile: boolean }>({
    userId: null,
    hasProfile: false,
  });
  sessionGateRef.current = {
    userId: user?.id ?? null,
    hasProfile: profile !== null,
  };

  const loadProfile = useCallback(async (userId: string) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    if (fetchProfileInFlightRef.current) {
      return;
    }
    fetchProfileInFlightRef.current = true;
    const gen = ++profileLoadGenRef.current;
    try {
      const p = await fetchProfile(userId);
      if (gen !== profileLoadGenRef.current) {
        return;
      }
      // TEMP DEBUG: trace auth/profile gating inputs before redirects.
      console.debug("[AuthContext] profile loaded", {
        userId: userId.slice(0, 8) + "…",
        hasProfile: Boolean(p),
        profile_completed: p?.profile_completed ?? null,
        onboarding_completed: (p as { onboarding_completed?: unknown } | null)?.onboarding_completed ?? null,
      });
      setProfile(p);
    } catch (e) {
      console.warn("[AuthContext] profile load error", e);
    } finally {
      fetchProfileInFlightRef.current = false;
    }
  }, []);

  const commitProfileRow = useCallback((row: unknown) => {
    if (!isProfileRecord(row)) {
      console.error("[AuthContext] commitProfileRow: valeur invalide (pas un profil)", row);
      return;
    }
    const normalized = profileRowToProfile(row);
    flushSync(() => {
      setProfile(normalized);
    });
  }, []);

  const refetchProfile = useCallback(async (): Promise<Profile | null> => {
    if (!user?.id) return null;
    if (fetchProfileInFlightRef.current) return null;
    fetchProfileInFlightRef.current = true;
    try {
      const p = await fetchProfile(user.id);
      if (p) {
        flushSync(() => {
          setProfile(p);
        });
      }
      return p;
    } finally {
      fetchProfileInFlightRef.current = false;
    }
  }, [user?.id]);

  const syncAuthSession = useCallback(async (): Promise<boolean> => {
    const {
      data: { session: next },
    } = await supabase.auth.getSession();
    flushSync(() => {
      setSession(next);
      setUser(next?.user ?? null);
    });
    return Boolean(next?.user?.id);
  }, []);

  const signOut = useCallback(async () => {
    setError(null);

    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      console.error("signOut error:", signOutError);
      setError(signOutError.message);
      return;
    }

    setUser(null);
    setSession(null);
    setProfile(null);
  }, []);

  useEffect(() => {
    let mounted = true;
    const watchdog = window.setTimeout(() => {
      if (!mounted) return;
      console.warn("[AuthContext] init watchdog: fin du chargement forcée (délai max)");
      initDoneRef.current = true;
      setIsAuthInitialized(true);
      setIsLoading(false);
      setError((prev) => prev ?? "Le chargement de la session a pris trop de temps. Vérifiez la connexion puis réouvrez l’app.");
    }, AUTH_INIT_WATCHDOG_MS);

    async function init() {
      console.log("[AuthContext] init start");
      setError(null);
      initDoneRef.current = false;

      try {
        const sessionResult = await resolveGetSession();

        if (!mounted) return;

        if (sessionResult === "hard-timeout") {
          console.warn("[AuthContext] redirect decision: hard-timeout → no user");
          setError("Connexion trop lente. Vérifiez le réseau puis réessayez.");
          setSession(null);
          setUser(null);
          setProfile(null);
          return;
        }

        let {
          data: { session: initialSession },
          error: sessionError,
        } = sessionResult;

        if (sessionError) {
          console.error("[AuthContext] getSession error:", sessionError);
          setError(sessionError.message);
          setSession(null);
          setUser(null);
          setProfile(null);
          return;
        }

        console.log("[AuthContext] initial getSession", {
          hasSession: !!initialSession?.user,
          oauthLikely: oauthCallbackLikely(),
        });

        if (!initialSession?.user) {
          const afterOAuth = await waitForOAuthSessionIfNeeded(false);
          if (afterOAuth?.data?.session) {
            initialSession = afterOAuth.data.session;
            if (afterOAuth.error) {
              console.error("[AuthContext] getSession after OAuth wait:", afterOAuth.error);
            }
          }
        }

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.user?.id) {
          const uid = initialSession.user.id;
          console.log("[AuthContext] session restored", { userId: uid.slice(0, 8) + "…" });
          const prof = await raceWithTimeout(loadProfile(uid), PROFILE_LOAD_RACE_MS);
          console.log("[AuthContext] loadProfile (init) result", { timedOut: prof === "timeout" });
          if (prof === "timeout") {
            console.warn("[AuthContext] loadProfile (init) slow — in-flight load may still complete");
          }
        } else {
          setProfile(null);
          console.log("[AuthContext] no session after bootstrap");
        }
      } finally {
        window.clearTimeout(watchdog);
        if (mounted) {
          initDoneRef.current = true;
          setIsAuthInitialized(true);
          setIsLoading(false);
          console.log("[AuthContext] auth bootstrap finished (initDone=true, isAuthInitialized=true)");
        }
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;

      console.log("[AuthContext] onAuthStateChange", {
        event,
        hasSession: !!nextSession?.user?.id,
        initDone: initDoneRef.current,
      });

      if (event === "INITIAL_SESSION") {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setError(null);
        if (nextSession?.user?.id) {
          const uid = nextSession.user.id;
          if (initDoneRef.current) {
            console.log("[AuthContext] INITIAL_SESSION after bootstrap — syncing profile");
            setIsLoading(true);
            try {
              const prof = await raceWithTimeout(loadProfile(uid), PROFILE_LOAD_RACE_MS);
              console.log("[AuthContext] INITIAL_SESSION loadProfile", { timedOut: prof === "timeout" });
              if (prof === "timeout") {
                console.warn("[AuthContext] loadProfile (INITIAL_SESSION) slow — in-flight load may still complete");
              }
            } catch (e) {
              console.error("[AuthContext] INITIAL_SESSION loadProfile:", e);
            } finally {
              if (mounted) setIsLoading(false);
            }
          } else {
            console.log("[AuthContext] INITIAL_SESSION during bootstrap — init() owns profile load");
          }
        } else {
          setProfile(null);
        }
        return;
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setError(null);

      if (event === "TOKEN_REFRESHED") {
        return;
      }

      if (nextSession?.user?.id) {
        const uid = nextSession.user.id;
        const gate = sessionGateRef.current;
        if (
          event === "SIGNED_IN" &&
          gate.userId === uid &&
          gate.hasProfile
        ) {
          console.log("[AuthContext] SIGNED_IN duplicate gate — refetch profile only");
          void loadProfile(uid);
          return;
        }

        console.log("[AuthContext] session event → load profile", { event, userId: uid.slice(0, 8) + "…" });
        setIsLoading(true);
        try {
          const prof = await raceWithTimeout(loadProfile(uid), PROFILE_LOAD_RACE_MS);
          console.log("[AuthContext] loadProfile (onAuthStateChange) done", { timedOut: prof === "timeout" });
          if (prof === "timeout") {
            console.warn("[AuthContext] loadProfile (onAuthStateChange) slow — in-flight load may still complete");
          }
        } catch (e) {
          console.error("[AuthContext] onAuthStateChange loadProfile:", e);
        } finally {
          if (mounted) setIsLoading(false);
        }
      } else {
        console.log("[AuthContext] redirect decision: no session in auth event", { event });
        setProfile(null);
        if (mounted) setIsLoading(false);
      }
    });

    void init();

    return () => {
      mounted = false;
      window.clearTimeout(watchdog);
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  /**
   * Accès app (Discover, etc.) : source de vérité BDD `profile_completed`
   * (écrit à la fin d’onboarding) + âge ≥ 18 sur `birth_date`.
   * Ne pas recalculer via `isOnboardingComplete` : trop fragile si une colonne
   * manque au fetch (ou schéma partiel) — repli côté cascade `PROFILE_LOAD_TIERS_FOR_AUTH`.
   */
  const isProfileComplete =
  profile?.profile_completed === true ||
  profile?.onboarding_completed === true;

  const value: AuthState = {
    user,
    session,
    profile,
    isProfileComplete,
    isAuthInitialized,
    isLoading,
    error,
    refetchProfile,
    commitProfileRow,
    syncAuthSession,
    signOut,
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