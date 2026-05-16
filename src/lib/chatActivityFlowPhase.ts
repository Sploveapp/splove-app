/** États UI mutuellement exclusifs du fil chat (activité / rendez-vous). */
export type ChatActivityFlowPhase =
  | "post_match_no_activity"
  | "activity_pending"
  | "activity_accepted_confirming"
  | "activity_confirmed";

export function deriveChatActivityFlowPhase(input: {
  meetupConfirmed: boolean;
  hasAcceptedProposal: boolean;
  hasPendingProposal: boolean;
}): ChatActivityFlowPhase {
  if (input.meetupConfirmed) return "activity_confirmed";
  if (input.hasAcceptedProposal) return "activity_accepted_confirming";
  if (input.hasPendingProposal) return "activity_pending";
  return "post_match_no_activity";
}
