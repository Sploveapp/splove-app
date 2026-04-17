import { ActivityProposalBubble, type ActivityProposalBubbleProps } from "./chat/ActivityProposalBubble";

export type ActivityProposalCardProps = ActivityProposalBubbleProps;

export function ActivityProposalCard(props: ActivityProposalCardProps) {
  return <ActivityProposalBubble {...props} />;
}

