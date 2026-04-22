import { ActivityProposalComposer, type ActivityProposalComposerProps } from "./ActivityProposalComposer";

export type ProposalComposerModalProps = ActivityProposalComposerProps;

export function ProposalComposerModal(props: ProposalComposerModalProps) {
  return <ActivityProposalComposer {...props} />;
}

