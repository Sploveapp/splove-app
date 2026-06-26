import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { SploveOAuthLoadingScreen } from "../components/SploveOAuthLoadingScreen";
import { logOAuthLoadingScreenGate } from "../lib/oauthLoadingScreenDiag";
import {
  isSupabaseGoogleAuthorizeUrl,
  parseOAuthGoogleStartAuthUrl,
} from "../lib/oauthGoogleStartUrl";

/**
 * Page intermédiaire : SPLove → redirect vers l’URL Supabase déjà construite (PKCE challenge inclus).
 * N’appelle jamais signInWithOAuth — le code_verifier reste dans l’app Capacitor.
 */
export default function OAuthGoogleStart() {
  const location = useLocation();
  const redirectedRef = useRef(false);

  useEffect(() => {
    logOAuthLoadingScreenGate("OAuthGoogleStart", true, ["oauth_google_start_route"]);
    return () => {
      logOAuthLoadingScreenGate("OAuthGoogleStart", false);
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("OAUTH_START_PAGE_OPEN");
    }

    const authUrl = parseOAuthGoogleStartAuthUrl(location.search, location.hash);
    if (!authUrl || redirectedRef.current) {
      if (import.meta.env.DEV && !authUrl) {
        console.warn("OAUTH_START_MISSING_AUTH_URL");
      }
      return;
    }

    if (!isSupabaseGoogleAuthorizeUrl(authUrl)) {
      if (import.meta.env.DEV) {
        console.warn("OAUTH_START_INVALID_AUTH_URL");
      }
      return;
    }

    let cancelled = false;
    const redirectToSupabase = () => {
      if (cancelled || redirectedRef.current) return;
      redirectedRef.current = true;
      if (Capacitor.getPlatform() === "ios") {
        console.log("IOS_SUPABASE_FLASH_DETECTED", {
          reason: "oauth_start_redirect_to_supabase",
          phase: "safari_redirect",
        });
      }
      if (import.meta.env.DEV) {
        console.log("OAUTH_START_REDIRECT_TO_SUPABASE");
      }
      window.location.replace(authUrl);
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(redirectToSupabase);
    });

    return () => {
      cancelled = true;
    };
  }, [location.search, location.hash]);

  return <SploveOAuthLoadingScreen />;
}
