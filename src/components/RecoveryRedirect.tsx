import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  bootstrapPasswordRecoveryFromUrl,
  processPendingPasswordRecoveryDeepLink,
} from "../lib/passwordRecoveryBootstrap";
import {
  getPasswordRecoveryFlowSnapshot,
  isPasswordRecoveryFlowActive,
  markPasswordRecoveryFlowActive,
  subscribePasswordRecoveryFlow,
} from "../lib/passwordRecoveryDeepLink";
import { SplashScreen } from "./SplashScreen";

/**
 * Priorité recovery : boot URL + PASSWORD_RECOVERY (même si l’événement a eu lieu avant le montage).
 * Réagit aussi aux deep links reçues pendant ForgotPassword (app en arrière-plan).
 */
export function RecoveryRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const [booting, setBooting] = useState(true);
  const bootedRef = useRef(false);
  const recoveryFlowActive = useSyncExternalStore(
    subscribePasswordRecoveryFlow,
    getPasswordRecoveryFlowSnapshot,
    () => false,
  );

  const goToResetPassword = useCallback(() => {
    console.log("[PASSWORD_RECOVERY] showing reset screen = true (router navigate)", {
      from: location.pathname,
    });
    navigate("/reset-password", { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    void bootstrapPasswordRecoveryFromUrl()
      .then(() => processPendingPasswordRecoveryDeepLink())
      .finally(() => {
        setBooting(false);
      });
  }, []);

  useEffect(() => {
    if (!recoveryFlowActive && !isPasswordRecoveryFlowActive()) return;
    if (location.pathname === "/forgot-password" || location.pathname !== "/reset-password") {
      goToResetPassword();
    }
  }, [recoveryFlowActive, location.pathname, goToResetPassword]);

  useEffect(() => {
    const onNavigateRequest = () => {
      goToResetPassword();
    };
    window.addEventListener("splove:password-recovery:navigate", onNavigateRequest);
    return () => {
      window.removeEventListener("splove:password-recovery:navigate", onNavigateRequest);
    };
  }, [goToResetPassword]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[PASSWORD_RECOVERY] auth event =", event, {
        hasSession: Boolean(session?.user?.id),
      });
      if (
        event === "PASSWORD_RECOVERY" ||
        (isPasswordRecoveryFlowActive() &&
          (event === "SIGNED_IN" || event === "INITIAL_SESSION"))
      ) {
        if (event === "PASSWORD_RECOVERY") {
          markPasswordRecoveryFlowActive(true);
          console.log("[PASSWORD_RECOVERY] recovery detected = true (auth event)");
        }
        goToResetPassword();
      }
    });
    return () => subscription.unsubscribe();
  }, [goToResetPassword]);

  if (booting && !recoveryFlowActive && !isPasswordRecoveryFlowActive()) {
    return null;
  }

  if (booting && (recoveryFlowActive || isPasswordRecoveryFlowActive())) {
    return <SplashScreen overlay />;
  }

  if ((recoveryFlowActive || isPasswordRecoveryFlowActive()) && location.pathname !== "/reset-password") {
    console.log("[PASSWORD_RECOVERY] showing reset screen = true (gate redirect)");
    return <Navigate to="/reset-password" replace />;
  }

  return null;
}
