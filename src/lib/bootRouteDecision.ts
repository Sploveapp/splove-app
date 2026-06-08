import type { Session } from "@supabase/supabase-js";
import type { Profile } from "../contexts/AuthContext";

export type BootRoute = "/auth" | "/onboarding" | "/move";

export type BootDecision =
  | { status: "loading"; reason: string }
  | { status: "ready"; route: BootRoute; reason: string };

export type BootDecisionInput = {
  isAuthInitialized: boolean;
  isLoading: boolean;
  isProfileLoading: boolean;
  session: Session | null;
  profile: Profile | null;
  isProfileComplete: boolean;
};

/** Décision unique boot / post-login : splash tant que `loading`, puis une route. */
export function resolveBootRoute(input: BootDecisionInput): BootDecision {
  const { isAuthInitialized, isLoading, isProfileLoading, session, profile, isProfileComplete } = input;

  if (!isAuthInitialized || isLoading) {
    return { status: "loading", reason: "session_bootstrap" };
  }

  const userId = session?.user?.id;
  if (!userId) {
    return { status: "ready", route: "/auth", reason: "no_session" };
  }

  if (isProfileLoading || profile == null || profile.id !== userId) {
    return { status: "loading", reason: "profile_bootstrap" };
  }

  if (isProfileComplete) {
    return { status: "ready", route: "/move", reason: "profile_complete" };
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
