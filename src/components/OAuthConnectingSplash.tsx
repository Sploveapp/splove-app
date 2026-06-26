import { useEffect } from "react";
import { OAuthLoadingScreenOverlay } from "./SploveOAuthLoadingScreen";
import { logOAuthLoadingScreenGate } from "../lib/oauthLoadingScreenDiag";

type Props = {
  logCallbackVisible?: boolean;
};

/** OAuth callback : overlay SPLove au-dessus de tout jusqu’à session OK ou retour /auth. */
export function OAuthConnectingSplash({ logCallbackVisible = false }: Props) {
  useEffect(() => {
    logOAuthLoadingScreenGate("OAuthConnectingSplash", true, ["auth_callback_route"]);
    return () => {
      logOAuthLoadingScreenGate("OAuthConnectingSplash", false);
    };
  }, []);

  if (logCallbackVisible) {
    console.log("CALLBACK_RENDER_VISIBLE");
  }
  return <OAuthLoadingScreenOverlay gate="OAuthConnectingSplash" visible />;
}
