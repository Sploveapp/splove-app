import { useEffect, useState, type ReactNode } from "react";
import {
  POST_OAUTH_MAX_MS,
  isPostOAuthSplashRequested,
  markPostOAuthSplashActive,
  markPostOAuthSplashComplete,
  subscribePostOAuthSplash,
} from "../lib/postOAuthSplash";
import { SploveOAuthLoadingScreen } from "./SploveOAuthLoadingScreen";

type Props = {
  children: ReactNode;
};

/** Flash post-OAuth Google uniquement — ne masque pas le splash natif au cold start. */
export function PostOAuthSplashGate({ children }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    return subscribePostOAuthSplash(() => {
      setShow(isPostOAuthSplashRequested());
    });
  }, []);

  useEffect(() => {
    if (!show) {
      markPostOAuthSplashComplete();
      return;
    }

    markPostOAuthSplashActive();
    console.log("[Splash] post oauth shown");

    const maxTimer = window.setTimeout(() => {
      markPostOAuthSplashComplete();
      setShow(false);
      console.log("[Splash] post oauth hidden");
    }, POST_OAUTH_MAX_MS);

    return () => window.clearTimeout(maxTimer);
  }, [show]);

  return (
    <>
      {children}
      {show ? <SploveOAuthLoadingScreen /> : null}
    </>
  );
}
