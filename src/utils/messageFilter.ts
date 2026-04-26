/**
 * SPLove — Filtre sécurité messages (alias vers la modération centralisée).
 */

import { antiExitValidator } from "../lib/antiExitValidator";

export type MessageFilterResult = {
  allowed: boolean;
  matched?: string;
};

export function validateMessage(text: string): MessageFilterResult {
  if (!text || typeof text !== "string") {
    return { allowed: true };
  }
  if (antiExitValidator(text, "message").isBlocked) {
    return { allowed: false, matched: "anti_exit" };
  }
  return { allowed: true };
}
