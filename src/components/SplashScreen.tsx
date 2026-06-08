import { useEffect, useRef } from "react";
import { hideCapacitorSplashWhenReady } from "../lib/capacitorNativeSplash";
import { dismissStaticBootSplash } from "../lib/staticBootSplash";
import { SploveSplashMark } from "./SploveSplashMark";

type Props = {
  /** Plein écran fixe au-dessus de l’app (boot / OAuth). */
  overlay?: boolean;
};

const FOOTER_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

function SplashFooter() {
  return (
    <footer
      className="pointer-events-none w-full shrink-0 text-center"
      style={{
        paddingBottom: "max(28px, env(safe-area-inset-bottom, 0px))",
        paddingLeft: 24,
        paddingRight: 24,
        transform: "translateY(-24px)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "22px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: "rgba(255,255,255,0.88)",
          fontFamily: FOOTER_FONT,
        }}
      >
        SPLove
      </p>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: "12px",
          fontWeight: 500,
          letterSpacing: "0.18em",
          lineHeight: 1.45,
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.42)",
          fontFamily: FOOTER_FONT,
        }}
      >
        Trouver l&apos;amour par le sport
      </p>
    </footer>
  );
}

/**
 * Splash SPLove — icône centrée, marque + slogan en footer bas.
 */
export function SplashScreen({ overlay = false }: Props) {
  const loggedRef = useRef(false);

  useEffect(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    console.log("WHITE_SCREEN_GUARD_VISIBLE");

    let cancelled = false;

    const handoffToWebSplash = () => {
      if (cancelled) return;
      // Native splash masqué en premier → le splash HTML statique apparaît immédiatement.
      hideCapacitorSplashWhenReady();
      window.setTimeout(() => {
        if (cancelled) return;
        dismissStaticBootSplash();
      }, 120);
    };

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        requestAnimationFrame(handoffToWebSplash);
      });
    } else {
      window.setTimeout(handoffToWebSplash, 32);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className={overlay ? "fixed inset-0 z-[99999]" : "relative min-h-[100dvh] w-full"}
      style={{
        backgroundColor: "#0B0B0F",
        minHeight: overlay ? undefined : "100dvh",
        display: "flex",
        flexDirection: "column",
      }}
      role="status"
      aria-live="polite"
      aria-label="SPLove — Trouver l'amour par le sport"
    >
      <div
        className="relative flex flex-1 items-center justify-center"
        style={{ minHeight: 0 }}
      >
        <SploveSplashMark size={168} />
      </div>
      <SplashFooter />
    </div>
  );
}
