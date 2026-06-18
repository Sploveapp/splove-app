import type { Session } from "@supabase/supabase-js";
import type { Profile } from "../contexts/AuthContext";
import { resolveAppShellState } from "./appShellState";
import { areProfileCompletionFlagsUnsettled } from "./profileBootCompletion";
import { collectProfileCriticalDataGaps } from "./onboardingDiscoverReadiness";

export type BootRoute = "/auth" | "/onboarding" | "/move";

export type BootDecision =
  | { status: "loading"; reason: string }
  | { status: "ready"; route: BootRoute; reason: string };

export type BootDecisionInput = {
  isAuthInitialized: boolean;
  isLoading: boolean;
  isProfileLoading: boolean;
  /** True après le premier fetch profil terminé (succès ou absence confirmée). */
  profileBootstrapSettled?: boolean;
  session: Session | null;
  profile: Profile | null;
  isProfileComplete: boolean;
};

/**
 * Décision boot : splash tant que session ou profil sont incertains.
 * `onboarding_completed: null` n’est jamais traité comme incomplet — on attend la réponse Supabase.
 */
export function resolveBootRoute(input: BootDecisionInput): BootDecision {
  const { isAuthInitialized, isLoading, isProfileLoading, session, profile, isProfileComplete } =
    input;

  if (!isAuthInitialized || isLoading) {
    return { status: "loading", reason: "session_bootstrap" };
  }

  const userId = session?.user?.id;
  if (!userId) {
    return { status: "ready", route: "/auth", reason: "no_session" };
  }

  if (profile?.id === userId && isProfileComplete) {
    return { status: "ready", route: "/move", reason: "profile_complete" };
  }

  if (isProfileLoading) {
    return { status: "loading", reason: "profile_pending" };
  }

  const shell = resolveAppShellState({
    isAuthInitialized,
    isLoading,
    sessionUserId: userId,
    profileId: profile?.id,
  });

  if (!shell.profileResolved) {
    if (isProfileLoading || input.profileBootstrapSettled !== true) {
      return { status: "loading", reason: "profile_pending" };
    }
    return { status: "ready", route: "/onboarding", reason: "profile_missing" };
  }

  if (isProfileComplete) {
    return { status: "ready", route: "/move", reason: "profile_complete" };
  }

  const row = profile as Record<string, unknown> | null;
  if (row && areProfileCompletionFlagsUnsettled(row)) {
    if (isProfileLoading || input.profileBootstrapSettled !== true) {
      return { status: "loading", reason: "profile_flags_pending" };
    }
    const sportsCount = Number(row.onboarding_sports_count ?? 0);
    const gaps = collectProfileCriticalDataGaps(
      row,
      Number.isFinite(sportsCount) ? sportsCount : 0,
    );
    if (gaps.length === 0) {
      return { status: "loading", reason: "profile_flags_ambiguous" };
    }
  }

  return { status: "ready", route: "/onboarding", reason: "profile_incomplete" };
}

const bootLogKeys = new Set<string>();

export function logBootDecision(decision: BootDecision, context?: string): void {
  const key = `${decision.status}|${
    decision.status === "ready" ? decision.route : decision.reason
  }|${context ?? ""}`;
  if (bootLogKeys.has(key)) return;
  bootLogKeys.add(key);

  console.log("[BOOT] route decision", {
    status: decision.status,
    ...(decision.status === "ready"
      ? { route: decision.route, reason: decision.reason }
      : { reason: decision.reason }),
    context: context ?? null,
  });

  if (decision.status === "ready") {
    console.log("[BOOT] redirect to", decision.route);
  }
}

export function logBootSessionLoaded(userId: string | null | undefined): void {
  const key = `session|${userId ?? "none"}`;
  if (bootLogKeys.has(key)) return;
  bootLogKeys.add(key);
  console.log("[BOOT] session loaded", { hasUser: Boolean(userId) });
}

export function logBootProfileLoaded(profile: Profile | null, isProfileComplete: boolean): void {
  const key = `profile|${profile?.id ?? "none"}|${isProfileComplete}`;
  if (bootLogKeys.has(key)) return;
  bootLogKeys.add(key);
  const row = profile as Record<string, unknown> | null;
  console.log("[BOOT] profile loaded", {
    profile_completed: row?.profile_completed ?? null,
    onboarding_completed: row?.onboarding_completed ?? null,
    onboarding_done: row?.onboarding_done ?? null,
    is_profile_complete: isProfileComplete,
  });
}
