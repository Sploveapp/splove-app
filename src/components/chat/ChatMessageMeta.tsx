import { formatChatMessageTimestamp, formatChatReadTime } from "../../lib/formatChatMessageTimestamp";
import { useTranslation } from "../../i18n/useTranslation";

export type ChatMessageMetaProps = {
  createdAt: string;
  align: "left" | "right" | "center";
  readAt?: string | null;
  showReadStatus?: boolean;
};

export function ChatMessageMeta({
  createdAt,
  align,
  readAt = null,
  showReadStatus = false,
}: ChatMessageMetaProps) {
  const { t, language } = useTranslation();
  const locale = language === "en" ? "en-GB" : "fr-FR";
  const timestamp = formatChatMessageTimestamp(createdAt, locale, t("chat_timestamp_yesterday"));

  return (
    <div
      className={`mt-0.5 flex max-w-[85%] flex-col gap-0.5 px-0.5 ${
        align === "right"
          ? "items-end self-end"
          : align === "center"
            ? "items-center self-center"
            : "items-start self-start"
      }`}
    >
      <span className="text-[10px] leading-tight text-app-muted/65">{timestamp}</span>
      {showReadStatus ? (
        <span className="text-[10px] leading-tight text-app-muted/55">
          {readAt
            ? (() => {
                const readTime = formatChatReadTime(readAt, locale);
                return readTime ? t("chat_message_seen_at", { time: readTime }) : t("chat_message_seen");
              })()
            : t("chat_message_sent")}
        </span>
      ) : null}
    </div>
  );
}
