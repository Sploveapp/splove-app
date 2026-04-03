/**
 * @file Point d’entrée historique — logique dans `contentModeration.ts`.
 */

export {
  CHAT_MESSAGE_POLICY_BLOCKED_MESSAGE,
  messageContainsDisallowedContent,
  normalizeMessageForPolicyScan,
  userGeneratedContentViolatesPolicy,
  bioPublicTextViolatesPolicy,
  type ModerationContext,
} from "./contentModeration";
