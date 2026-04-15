import { Navigate, useNavigate } from "react-router-dom";
import { BETA_MODE } from "../constants/beta";

export default function Checkout() {
  const navigate = useNavigate();

  if (BETA_MODE) {
    return <Navigate to="/splove-plus" replace />;
  }

  return (
    <div className="min-h-0 bg-app-bg">
      <main className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 pb-12 pt-10 text-center">
        <h1 className="text-xl font-bold tracking-tight text-app-text">Finaliser SPLove+</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-app-muted">
          Le paiement sera bientôt disponible.
        </p>
        <button
          type="button"
          onClick={() => navigate("/splove-plus")}
          className="mt-8 rounded-xl border border-app-border bg-app-card px-5 py-2.5 text-sm font-semibold text-app-text shadow-sm transition hover:bg-app-border"
        >
          Retour à SPLove+
        </button>
      </main>
    </div>
  );
}
