/** Logs temporaires flux fin onboarding — filtrer `[OnboardingFlow]` dans Xcode / Safari. */
export const OnboardingFlowLog = {
  finalSubmitPayload(payload: Record<string, unknown>): void {
    console.log("[OnboardingFlow] final_submit_payload", {
      profile_completed: payload.profile_completed ?? null,
      onboarding_completed: payload.onboarding_completed ?? null,
      onboarding_done: payload.onboarding_done ?? null,
      onboarding_step: payload.onboarding_step ?? null,
      accepted_terms_at: payload.accepted_terms_at ?? null,
      accepted_privacy_at: payload.accepted_privacy_at ?? null,
      terms_accepted_at: payload.terms_accepted_at ?? null,
      userId: payload.id ?? null,
    });
  },

  finalSubmitSaved(payload: {
    userId: string;
    source: string;
    row?: Record<string, unknown> | null;
    error?: string | null;
  }): void {
    const row = payload.row ?? null;
    console.log("[OnboardingFlow] final_submit_saved", {
      userId: payload.userId,
      source: payload.source,
      error: payload.error ?? null,
      profile_completed: row?.profile_completed ?? null,
      onboarding_completed: row?.onboarding_completed ?? null,
      onboarding_done: row?.onboarding_done ?? null,
      onboarding_step: row?.onboarding_step ?? null,
      accepted_terms_at: row?.accepted_terms_at ?? null,
      accepted_privacy_at: row?.accepted_privacy_at ?? null,
      terms_accepted_at: row?.terms_accepted_at ?? null,
    });
  },

  profileAfterSubmit(payload: {
    userId: string;
    source: string;
    row?: Record<string, unknown> | null;
    error?: string | null;
  }): void {
    const row = payload.row ?? null;
    console.log("[OnboardingFlow] profile_after_submit", {
      userId: payload.userId,
      source: payload.source,
      error: payload.error ?? null,
      profile_completed: row?.profile_completed ?? null,
      onboarding_completed: row?.onboarding_completed ?? null,
      onboarding_done: row?.onboarding_done ?? null,
      accepted_terms_at: row?.accepted_terms_at ?? null,
      accepted_privacy_at: row?.accepted_privacy_at ?? null,
    });
  },

  redirectDecision(payload: {
    userId: string;
    target: string;
    reason: string;
    profile_completed?: boolean | null;
    onboarding_completed?: boolean | null;
    onboarding_done?: boolean | null;
  }): void {
    console.log("[OnboardingFlow] redirect_decision", payload);
  },
};
