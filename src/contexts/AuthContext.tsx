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
import { PROFILE_SELECT } from "../lib/profileSelect";
import { isAdultFromBirthIso } from "../lib/ageGate";
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
  /** Validation produit des photos (voir migration `043_profile_photo_validation_statuses`). */
  portrait_photo_status?: string | null;
  body_photo_status?: string | null;
  photo_status?: string | null;
  portrait_rejection_code?: string | null;
  body_rejection_code?: string | null;
  /** Activités adaptées — optionnel, voir migration 005 / 041. */
  needs_adapted_activities?: boolean | null;
  pref_open_to_standard_activity?: boolean | null;
  pref_open_to_adapted_activity?: boolean | null;
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
  commitProfileRow: (row: Record<string, unknown>) => void;
  /** Re-lit la session Supabase et met à jour `user` / `session` de façon synchrone. Retourne false si aucun utilisateur. */
  syncAuthSession: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/** Évite un `isLoading` infini si getSession / fetch profil ne se termine jamais. */
/** Filet si une promesse reste pendante malgré les courses (getSession + loadProfile peuvent aller jusqu’à ~2 × races). */
const AUTH_INIT_WATCHDOG_MS = 25_000;
const PROFILE_LOAD_RACE_MS = 10_000;

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

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("fetchProfile error:", error);
    return null;
  }

  let row = data;

  if (!row) {
    const created = await ensureProfileRowForAuthUserId(userId);
    if (!created) return null;
    const retry = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", userId)
      .maybeSingle();
    if (retry.error) {
      console.error("fetchProfile retry error:", retry.error);
      return null;
    }
    row = retry.data;
  }

  if (!row) return null;

  return {
    ...row,
    profile_completed: !!row.profile_completed,
    is_photo_verified: !!(row as { is_photo_verified?: boolean }).is_photo_verified,
  } as Profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    const p = await fetchProfile(userId);
    setProfile(p);
  }, []);

  const commitProfileRow = useCallback((row: Record<string, unknown>) => {
    const normalized = {
      ...row,
      profile_completed: !!(row as { profile_completed?: unknown }).profile_completed,
      is_photo_verified: !!(row as { is_photo_verified?: unknown }).is_photo_verified,
    } as Profile;
    flushSync(() => {
      setProfile(normalized);
    });
  }, []);

  const refetchProfile = useCallback(async (): Promise<Profile | null> => {
    if (!user?.id) return null;
    const p = await fetchProfile(user.id);
    if (p) {
      flushSync(() => {
        setProfile(p);
      });
    }
    return p;
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
      setError(null);

      try {
        const sessionRace = raceWithTimeout(supabase.auth.getSession(), PROFILE_LOAD_RACE_MS);
        const sessionResult = await sessionRace;

        if (!mounted) return;

        if (sessionResult === "timeout") {
          console.error("[AuthContext] getSession timeout");
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
          console.error("getSession error:", sessionError);
          setError(sessionError.message);
          setSession(null);
          setUser(null);
          setProfile(null);
          return;
        }

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.user?.id) {
          const prof = await raceWithTimeout(loadProfile(initialSession.user.id), PROFILE_LOAD_RACE_MS);
          if (prof === "timeout") {
            console.error("[AuthContext] loadProfile (init) timeout");
            setError((prev) => prev ?? "Profil lent à charger. Vous pouvez réessayer depuis la page de connexion.");
          }
        } else {
          setProfile(null);
        }
      } finally {
        window.clearTimeout(watchdog);
        if (mounted) {
          setIsLoading(false);
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
            console.error("[AuthContext] loadProfile (onAuthStateChange) timeout");
            setError((prev) => prev ?? "Profil lent à charger. Réessayez.");
          }
        } catch (e) {
          console.error("AuthProvider onAuthStateChange loadProfile:", e);
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

  /** `profile_completed` en BDD + date de naissance indiquant ≥ 18 ans (même logique que l’onboarding). */
  const isProfileComplete =
    profile?.profile_completed === true && isAdultFromBirthIso(profile.birth_date);

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