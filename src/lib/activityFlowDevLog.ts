/** Logs DEV temporaires pour le flux proposition d’activité. */
export function logActivityFlowState(input: {
  proposalId?: string | null;
  status?: string | null;
  proposerId?: string | null;
  currentUserId?: string | null;
  action?: string | null;
  isSubmitting?: boolean;
  source?: string;
}): void {
  if (!import.meta.env.DEV) return;
  console.log("[ACTIVITY_FLOW_STATE]", {
    proposalId: input.proposalId ?? null,
    status: input.status ?? null,
    proposerId: input.proposerId ?? null,
    currentUserId: input.currentUserId ?? null,
    action: input.action ?? null,
    isSubmitting: Boolean(input.isSubmitting),
    source: input.source ?? null,
  });
}
