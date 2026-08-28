import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { bootstrapPasswordRecoveryFromUrl } from "../lib/passwordRecoveryBootstrap";
import {
  isPasswordRecoveryFlowActive,
  markPasswordRecoveryFlowActive,
} from "../lib/passwordRecoveryDeepLink";
import { SplashScreen } from "./SplashScreen";

/**
 * Priorité recovery : boot URL + PASSWORD_RECOVERY (même si l’événement a eu lieu avant le montage).
 */
export function RecoveryRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const [booting, setBooting] = useState(true);
  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    void bootstrapPasswordRecoveryFromUrl().finally(() => {
      setBooting(false);
    });
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[PASSWORD_RECOVERY] auth event =", event, {
        hasSession: Boolean(session?.user?.id),
      });
      if (event === "PASSWORD_RECOVERY") {
        markPasswordRecoveryFlowActive(true);
        console.log("[PASSWORD_RECOVERY] recovery detected = true (auth event)");
        if (location.pathname !== "/reset-password") {
          console.log("[PASSWORD_RECOVERY] showing reset screen = true");
          navigate("/reset-password", { replace: true });
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate, location.pathname]);

  if (booting && !isPasswordRecoveryFlowActive()) {
    return null;
  }

  if (booting && isPasswordRecoveryFlowActive()) {
    return <SplashScreen overlay />;
  }

  if (isPasswordRecoveryFlowActive() && location.pathname !== "/reset-password") {
    console.log("[PASSWORD_RECOVERY] showing reset screen = true (gate redirect)");
    return <Navigate to="/reset-password" replace />;
  }

  return null;
}
