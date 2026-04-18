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
  PROFILE_SELECT_CORE,
  PROFILE_SELECT_MINIMAL,
  isPostgresUndefinedColumnError,
} from "../lib/profileSelect";
import type { AppProfile } from "../lib/appProfile";
import { isProfileRecord } from "../lib/appProfile";
import { isAdultFromBirthIso } from "../lib/ageGate";
import { isOnboardingComplete } from "../lib/profileCompleteness";
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
  return {
    ...row,
    profile_completed: !!row.profile_completed,
    is_photo_verified: !!(row as { is_photo_verified?: boolean | null }).is_photo_verified,
  } as Profile;
}

function profileFromMinimalRow(raw: { id: string; first_name?: string | null }): Profile | null {
  const row = {
    id: raw.id,
    first_name: raw.first_name ?? null,
    profile_completed: false,
  };
  if (!isProfileRecord(row)) return null;
  return profileRowToProfile(row as AppProfile);
}

/**
 * Une seule source de colonnes : `PROFILE_SELECT_CORE` (pas `location_source`, pas colonnes absentes en prod).
 * Si 42703 (colonne inconnue) : **un seul** retry avec `PROFILE_SELECT_MINIMAL`, puis stop.
 */
async function fetchProfile(userId: string): Promise<Profile | null> {
  const q = (cols: string) =>
    supabase.from("profiles").select(cols).eq("id", userId).maybeSingle();

  let { data, error } = await q(PROFILE_SELECT_CORE);

  if (error) {
    if (isPostgresUndefinedColumnError(error)) {
      console.warn("[AuthContext] fetchProfile: 42703 — retry with minimal columns");
      const min = await q(PROFILE_SELECT_MINIMAL);
      if (min.error || !min.data) {
        if (min.error) {
          console.warn("[AuthContext] fetchProfile: minimal select failed", min.error.message);
        }
        return null;
      }
      return profileFromMinimalRow(min.data as unknown as { id: string; first_name?: string | null });
    }
    if (error) {
      console.warn("[AuthContext] fetchProfile:", error.message);
      return null;
    }
  }

  if (!data) {
    const created = await ensureProfileRowForAuthUserId(userId);
    if (!created) return null;
    const retry = await q(PROFILE_SELECT_CORE);
    if (retry.error) {
      if (isPostgresUndefinedColumnError(retry.error)) {
        console.warn("[AuthContext] fetchProfile retry: 42703 — minimal select");
        const min = await q(PROFILE_SELECT_MINIMAL);
        if (min.error || !min.data) {
          if (min.error) console.warn("[AuthContext] fetchProfile: minimal after ensure failed", min.error.message);
          return null;
        }
        return profileFromMinimalRow(min.data as unknown as { id: string; first_name?: string | null });
      }
      console.warn("[AuthContext] fetchProfile retry:", retry.error.message);
      return null;
    } else if (retry.data) {
      data = retry.data;
    }
    if (!data) return null;
  }

  if (!isProfileRecord(data)) {
    console.warn("[AuthContext] fetchProfile: unexpected profile row shape");
    return null;
  }

  return profileRowToProfile(data);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setIsLoading(false);
      setError((prev) => prev ?? "Le chargement de la session a pris trop de temps. Vérifiez la connexion puis réouvrez l’app.");
    }, AUTH_INIT_WATCHDOG_MS);

    async function init() {
      console.log("[AuthContext] init start");
      setError(null);

      try {
        const sessionResult = await resolveGetSession();

        if (!mounted) return;

        if (sessionResult === "hard-timeout") {
          setError("Connexion trop lente. Vérifiez le réseau puis réessayez.");
          setSession(null);
          setUser(null);
          setProfile(null);
          return;
        }

        const {
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

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.user?.id) {
          const uid = initialSession.user.id;
          console.log("[AuthContext] session restored", { userId: uid.slice(0, 8) + "…" });
          const prof = await raceWithTimeout(loadProfile(uid), PROFILE_LOAD_RACE_MS);
          if (prof === "timeout") {
            console.warn("[AuthContext] loadProfile (init) slow — in-flight load may still complete");
          }
        } else {
          setProfile(null);
          console.log("[AuthContext] no session");
        }
      } finally {
        window.clearTimeout(watchdog);
        if (mounted) {
          setIsLoading(false);
          console.log("[AuthContext] auth ready");
        }
      }
    }

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;

      if (event === "INITIAL_SESSION") {
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
          void loadProfile(uid);
          return;
        }

        setIsLoading(true);
        try {
          const prof = await raceWithTimeout(loadProfile(uid), PROFILE_LOAD_RACE_MS);
          if (prof === "timeout") {
            console.warn("[AuthContext] loadProfile (onAuthStateChange) slow — in-flight load may still complete");
          }
        } catch (e) {
          console.error("[AuthContext] onAuthStateChange loadProfile:", e);
        } finally {
          if (mounted) setIsLoading(false);
        }
      } else {
        setProfile(null);
        if (mounted) setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      window.clearTimeout(watchdog);
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  /** Validation onboarding globale + âge >= 18 ans. */
  const isProfileComplete =
    isOnboardingComplete(profile) && isAdultFromBirthIso(profile?.birth_date);

  const value: AuthState = {
    user,
    session,
    profile,
    isProfileComplete,
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