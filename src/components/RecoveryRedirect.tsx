import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

/**
 * Après un lien de réinitialisation Supabase, le hash peut ne pas être #/reset-password.
 * On écoute PASSWORD_RECOVERY et on normalise la route vers /reset-password.
 */
export function RecoveryRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && location.pathname !== "/reset-password") {
        navigate("/reset-password", { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate, location.pathname]);

  return null;
}
