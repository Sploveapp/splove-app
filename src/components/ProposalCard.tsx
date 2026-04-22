import { ActivityProposalCard, type ActivityProposalCardProps } from "./ActivityProposalCard";

export type ProposalCardProps = ActivityProposalCardProps;

export function ProposalCard(props: ProposalCardProps) {
  return <ActivityProposalCard {...props} />;
}

