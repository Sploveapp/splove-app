/**
 * SPLove — Filtre sécurité messages (composer chat).
 * Alias stable vers la modération dédiée + anti-exit historique.
 */

import { antiExitValidator } from "../lib/antiExitValidator";
import {
  moderateChatComposerText,
  type ChatComposerModerationResult,
} from "../lib/chatComposerModeration";

export type MessageFilterResult = {
  allowed: boolean;
  matched?: string;
  moderation?: ChatComposerModerationResult;
};

export function validateMessage(text: string): MessageFilterResult {
  if (!text || typeof text !== "string") {
    return { allowed: true };
  }
  const moderation = moderateChatComposerText(text);
  if (moderation.blocked) {
    return { allowed: false, matched: moderation.kind, moderation };
  }
  if (antiExitValidator(text, "message").isBlocked) {
    return { allowed: false, matched: "anti_exit" };
  }
  return { allowed: true };
}

export { moderateChatComposerText };
