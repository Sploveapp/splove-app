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
import { PROFILE_SELECT, PROFILE_SELECT_CORE, isUndefinedColumnError } from "../lib/profileSelect";
import type { AppProfile } from "../lib/appProfile";
import { isProfileRecord } from "../lib/appProfile";
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
  /** Modération automatique (slots 1 = portrait, 2 = corps) — migration 058. */
  photo1_status?: string | null;
  photo2_status?: string | null;
  photo_moderation_overall?: string | null;
  is_under_review?: boolean | null;
  moderation_strikes_count?: number | null;
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

async function fetchProfile(userId: string): Promise<Profile | null> {
  let selectCols = PROFILE_SELECT;
  let { data, error } = await supabase
    .from("profiles")
    .select(selectCols)
    .eq("id", userId)
    .maybeSingle();

  if (error && isUndefinedColumnError(error, "location_source")) {
    console.warn("[AuthContext] fetchProfile: location_source absent en base, relecture sans cette colonne");
    selectCols = PROFILE_SELECT_CORE;
    ({ data, error } = await supabase
      .from("profiles")
      .select(selectCols)
      .eq("id", userId)
      .maybeSingle());
  }

  if (error) {
    console.error("fetchProfile error:", error);
    return null;
  }

  let row = data;

  if (!row) {
    const created = await ensureProfileRowForAuthUserId(userId);
    if (!created) return null;
    let retry = await supabase
      .from("profiles")
      .select(selectCols)
      .eq("id", userId)
      .maybeSingle();
    if (retry.error && isUndefinedColumnError(retry.error, "location_source")) {
      selectCols = PROFILE_SELECT_CORE;
      retry = await supabase
        .from("profiles")
        .select(selectCols)
        .eq("id", userId)
        .maybeSingle();
    }
    if (retry.error) {
      console.error("fetchProfile retry error:", retry.error);
      return null;
    }
    row = retry.data;
  }

  if (!row) return null;

  if (!isProfileRecord(row)) {
    console.error("[AuthContext] fetchProfile: réponse inattendue (pas un objet profil)", row);
    return null;
  }

  return profileRowToProfile(row);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Incrémenté à chaque loadProfile — ignore les réponses obsolètes (courses onAuthStateChange). */
  const profileLoadGenRef = useRef(0);

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
    const gen = ++profileLoadGenRef.current;
    console.log("[AuthContext] profile load start", { userId: userId.slice(0, 8) + "…" });
    try {
      const p = await fetchProfile(userId);
      if (gen !== profileLoadGenRef.current) {
        console.log("[AuthContext] profile load ignored (stale)");
        return;
      }
      setProfile(p);
      if (p) {
        console.log("[AuthContext] profile load success");
      } else {
        console.warn("[AuthContext] profile load fail (null row)");
      }
    } catch (e) {
      console.error("[AuthContext] profile load error", e);
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
            console.error(
              "[AuthContext] loadProfile (init) slow (race timeout) — in-flight load may still complete",
            );
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
            console.error(
              "[AuthContext] loadProfile (onAuthStateChange) slow (race timeout) — in-flight load may still complete",
            );
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