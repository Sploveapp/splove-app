import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/**
 * Ancien interstitiel photo Discover — désormais transparent (aucun blocage).
 */
export function PhotoVerificationDiscoverGate({ children }: Props) {
  return children;
}
