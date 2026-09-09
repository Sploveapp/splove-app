import type { NavigateFunction } from "react-router-dom";
import { CHAT_BACK_TO_MOVE_PATH } from "./chatPresenceStatus";

/** Retour écran principal Move — remplace l'entrée courante (ex. `/chat/:id` invalide). */
export function navigateToMoveHome(navigate: NavigateFunction): void {
  navigate(CHAT_BACK_TO_MOVE_PATH, { replace: true });
}
