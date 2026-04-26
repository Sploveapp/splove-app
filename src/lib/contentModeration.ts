/**
 * Modération des textes saisis par les utilisateurs (messages, phrase sport onboarding).
 * Logique de blocage portée par `antiExitValidator.ts` — ce fichier reste l’API stable.
 */

import { antiExitValidator } from "./antiExitValidator";

export { SAFETY_CONTENT_REFUSAL as CHAT_MESSAGE_POLICY_BLOCKED_MESSAGE } from "../constants/copy";
export { antiExitValidator, textViolatesAntiExitRules } from "./antiExitValidator";
export { normalizeTextForExitScan, normalizeTextForExitScan as normalizeMessageForPolicyScan } from "./antiExitValidator";

export type ModerationContext = "chat" | "bio";

export function userGeneratedContentViolatesPolicy(
  raw: string,
  context: ModerationContext,
): boolean {
  if (antiExitValidator(raw, context === "bio" ? "profile" : "message").isBlocked) return true;
  if (context === "bio" && /#/.test(raw)) return true;
  return false;
}

export function messageContainsDisallowedContent(raw: string): boolean {
  return userGeneratedContentViolatesPolicy(raw, "chat");
}

export function bioPublicTextViolatesPolicy(raw: string): boolean {
  return userGeneratedContentViolatesPolicy(raw, "bio");
}
