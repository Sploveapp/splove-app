import { useEffect, useState } from "react";

/**
 * Espace occupé par le clavier iOS / mobile (visualViewport).
 * 0 quand le clavier est fermé — évite tout chevauchement avec la bottom nav.
 */
export function useVisualViewportKeyboardInset(): number {
  const [insetPx, setInsetPx] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const sync = () => {
      const gap = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      setInsetPx(gap);
    };

    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, []);

  return insetPx;
}
