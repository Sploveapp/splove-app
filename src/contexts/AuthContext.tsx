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
import { useNavigate } from "react-router-dom";
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

  return normalized;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);

  /** Incrémenté à chaque loadProfile — ignore les réponses obsolètes. */
  const profileLoadGenRef = useRef(0);
  /** Évite les fetch profil concurrents / boucles. */
  const fetchProfileInFlightRef = useRef(false);

  useEffect(() => {
    console.log("[AuthContext] global loading", isLoading ? "start" : "end");
  }, [isLoading]);

  const loadProfile = useCallback(async (userId: string) => {
    if (!userId) {
      setIsProfileLoading(false);
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
      setIsProfileLoading(false);
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
    setIsProfileLoading(true);
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
      setIsProfileLoading(false);
    }
  }, [user?.id]);

  const syncAuthSession = useCallback(async (): Promise<boolean> => {
    const r = await raceWithTimeout(supabase.auth.getSession(), SESSION_SYNC_RACE_MS);
    if (r === "timeout") {
      console.warn("[AuthContext] syncAuthSession: getSession timeout", SESSION_SYNC_RACE_MS, "ms");
      return false;
    }
    const {
      data: { session: next },
    } = r;
    flushSync(() => {
      setSession(next);
      setUser(next?.user ?? null);
    });
    return Boolean(next?.user?.id);
  }, []);

  const signOut = useCallback(async () => {
    console.log("[Logout] start");
    setError(null);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        console.error("signOut error:", signOutError);
        setError(signOutError.message);
        flushSync(() => {
          setIsLoading(false);
          setIsAuthInitialized(true);
        });
        console.log("[AuthContext] loading false");
        return;
      }
      console.log("[Logout] signed out");
      profileLoadGenRef.current += 1;
      fetchProfileInFlightRef.current = false;
        flushSync(() => {
        setUser(null);
        setSession(null);
        setProfile(null);
        setIsProfileLoading(false);
        setIsLoading(false);
        setIsAuthInitialized(true);
      });
      console.log("[AuthContext] loading false");
      // Only post-logout; never used to “recover” from /auth/callback
      navigate("/auth", { replace: true });
    } catch (e) {
      console.error("[Logout] error", e);
      flushSync(() => {
        setIsLoading(false);
        setIsAuthInitialized(true);
      });
      console.log("[AuthContext] loading false");
    }
  }, [navigate]);

  /**
   * Session: une seule init (getSession) + un seul onAuthStateChange.
   * `isLoading` repasse jamais true pour le profil — le profil se charge en arrière-plan.
   */
  useEffect(() => {
    let mounted = true;

    async function init() {
      setError(null);
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!mounted) return;
        if (sessionError) {
          console.error("[AuthContext] getSession error:", sessionError);
          setError(sessionError.message);
          setSession(null);
          setUser(null);
          return;
        }
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      console.log("[AuthContext] state change", event, nextSession);
      if (!mounted) return;

      if (event === "SIGNED_OUT") {
        console.log("[AuthContext] SIGNED_OUT");
        profileLoadGenRef.current += 1;
        fetchProfileInFlightRef.current = false;
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

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setError(null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) {
      setIsProfileLoading(false);
      setProfile(null);
      return;
    }
    setIsProfileLoading(true);
    void loadProfile(uid);
  }, [session?.user?.id, loadProfile]);

  /** Garde navigation : uniquement la colonne BDD `profile_completed === true` (onboarding success). */
  const isProfileComplete = profile?.profile_completed === true;
  const profileIncompleteReason = isProfileComplete ? null : "profile_not_completed";

  const value: AuthState = {
    user,
    session,
    profile,
    isProfileComplete,
    profileIncompleteReason,
    isAuthInitialized,
    isLoading,
    isProfileLoading,
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