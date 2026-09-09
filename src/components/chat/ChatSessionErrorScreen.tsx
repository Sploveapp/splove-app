import { useNavigate } from "react-router-dom";
import { GlobalHeader } from "../GlobalHeader";
import { navigateToMoveHome } from "../../lib/chatConversationRoute";
import { useTranslation } from "../../i18n/useTranslation";

type ChatSessionErrorScreenProps = {
  message: string;
};

/** Conversation introuvable / erreur de chargement — sortie garantie vers Move. */
export function ChatSessionErrorScreen({ message }: ChatSessionErrorScreenProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg font-sans">
      <GlobalHeader />
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-red-600">{message}</p>
        <button
          type="button"
          onClick={() => navigateToMoveHome(navigate)}
          className="mt-6 text-left text-sm font-semibold text-[#FF1E2D] underline"
        >
          {t("chat_back_to_discover")}
        </button>
      </div>
    </div>
  );
}
