import type { ComponentProps } from "react";
import { ActivityProposalModal } from "./ActivityProposalModal";

export type ActivityProposalComposerProps = ComponentProps<typeof ActivityProposalModal>;

export function ActivityProposalComposer(props: ActivityProposalComposerProps) {
  return <ActivityProposalModal {...props} />;
}

