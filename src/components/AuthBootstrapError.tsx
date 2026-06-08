type Props = {
  title?: string;
  message: string;
  onRetry: () => void;
};

/** Écran de secours quand auth/profil dépasse le timeout bootstrap (iOS / réseau instable). */
export function AuthBootstrapError({
  title = "Connexion impossible",
  message,
  onRetry,
}: Props) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-16 text-app-text">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-3 max-w-sm text-center text-sm leading-relaxed text-app-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-xl bg-app-brand px-5 py-2.5 text-sm font-semibold text-white"
      >
        Réessayer
      </button>
    </main>
  );
}
