/**
 * SPLove — Filtre sécurité messages (alias vers la modération centralisée).
 */

import { messageContainsDisallowedContent } from "../lib/contentModeration";

export type MessageFilterResult = {
  allowed: boolean;
  matched?: string;
};

export function validateMessage(text: string): MessageFilterResult {
  if (!text || typeof text !== "string") {
    return { allowed: true };
  }
  if (messageContainsDisallowedContent(text)) {
    return { allowed: false, matched: "policy" };
  }
  return { allowed: true };
}
