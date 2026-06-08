import type { Session } from "@supabase/supabase-js";
import type { Profile } from "../contexts/AuthContext";

export type AppAuthReadyInput = {
  isAuthInitialized: boolean;
  session: Session | null;
  profile: Profile | null;
};

/** Session + profil chargé + `profile_completed` — le splash post-login peut être retiré. */
export function isAppAuthReady({ isAuthInitialized, session, profile }: AppAuthReadyInput): boolean {
  if (!isAuthInitialized) return false;
  const userId = session?.user?.id;
  if (!userId) return false;
  if (!profile?.id || profile.id !== userId) return false;
  return profile.profile_completed === true;
}
