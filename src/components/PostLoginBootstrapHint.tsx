/** Message affiché pendant le bootstrap post-login (non bloquant). */
export const POST_LOGIN_BOOTSTRAP_MESSAGE = "Tu aimes le sport ? Tu es au bon endroit.";

/**
 * Indicateur léger post-login — ne masque pas la page (Onboarding visible en dessous).
 */
export function PostLoginBootstrapHint() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={POST_LOGIN_BOOTSTRAP_MESSAGE}
      className="pointer-events-none fixed inset-x-0 z-[120] flex justify-center px-5"
      style={{ bottom: "max(28px, env(safe-area-inset-bottom, 0px))" }}
    >
      <div
        className="flex max-w-md items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 shadow-lg backdrop-blur-md"
        style={{ background: "rgba(11, 11, 15, 0.82)" }}
      >
        <span
          aria-hidden
          className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white/80"
        />
        <p
          className="m-0 text-center text-sm font-medium leading-snug"
          style={{ color: "rgba(255,255,255,0.88)" }}
        >
          {POST_LOGIN_BOOTSTRAP_MESSAGE}
        </p>
      </div>
    </div>
  );
}
