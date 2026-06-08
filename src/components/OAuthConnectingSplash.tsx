import { SploveOAuthLoadingScreen } from "./SploveOAuthLoadingScreen";

type Props = {
  logCallbackVisible?: boolean;
};

/** OAuth callback : overlay SPLove au-dessus de tout jusqu’à session OK ou retour /auth. */
export function OAuthConnectingSplash({ logCallbackVisible = false }: Props) {
  if (logCallbackVisible) {
    console.log("CALLBACK_RENDER_VISIBLE");
  }
  return <SploveOAuthLoadingScreen />;
}
