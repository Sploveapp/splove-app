import type { ChatMessageInput } from "../../lib/messages/activityMessageParser";
import { parseActivityResponse } from "../../lib/messages/activityMessageParser";
import { useTranslation } from "../../i18n/useTranslation";

export type ActivityResponseBubbleProps = {
  message: ChatMessageInput;
};

/**
 * Réponse système à une proposition (acceptation, refus, contre-proposition, etc.).
 * Rendu compact, centré, sans dupliquer une bulle utilisateur classique.
 */
export function ActivityResponseBubble({ message }: ActivityResponseBubbleProps) {
  const { t } = useTranslation();
  const parsed = parseActivityResponse(message);
  const label = parsed.i18nKey
    ? t(parsed.i18nKey)
    : parsed.fallbackLabel || t("activity_response_update");
  return (
    <div className="mx-auto max-w-[92%] rounded-2xl border border-app-border/60 bg-app-card/80 px-3 py-2 text-center shadow-sm ring-1 ring-white/[0.04]">
      <p className="text-[12px] font-medium leading-snug text-app-muted">{label}</p>
    </div>
  );
}
