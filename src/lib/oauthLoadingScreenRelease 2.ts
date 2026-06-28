import { releasePostAuthUi } from "./oauthUxRelease";
import {
  collectOAuthLoadingScreenBlockers,
  logOAuthLoadingScreenGate,
} from "./oauthLoadingScreenDiag";
import { markOAuthSessionVerifiedLatch } from "./oauthSessionVerifiedLatch";

/** Ferme l’écran OAuth dès que getSession + getUser sont validés. */
export function releaseOAuthLoadingScreenOnSessionVerified(trigger: string): void {
  markOAuthSessionVerifiedLatch();
  const blockersBefore = collectOAuthLoadingScreenBlockers();
  releasePostAuthUi(trigger);
  const reasons = ["session_user_verified", ...blockersBefore];
  console.log("OAUTH_LOADING_SCREEN_HIDE", { trigger, reasons });
  console.log("OAUTH_LOADING_SCREEN_REASON", { gate: trigger, reasons, phase: "hide" });
  logOAuthLoadingScreenGate(trigger, false, ["session_user_verified"]);
}

/** hasSession + /move : libère tous les overlays OAuth sans attendre le profil. */
export function forceReleaseOAuthLoadingOnMove(trigger: string): void {
  markOAuthSessionVerifiedLatch();
  releasePostAuthUi(trigger, "/move");
  const reasons = ["session_on_move_force", ...collectOAuthLoadingScreenBlockers()];
  console.log("OAUTH_LOADING_SCREEN_HIDE", { trigger, reasons });
  console.log("OAUTH_LOADING_SCREEN_REASON", { gate: trigger, reasons, phase: "hide" });
  logOAuthLoadingScreenGate(trigger, false, ["session_on_move_force"]);
}
