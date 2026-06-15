import { useEffect } from "react";
import { hideCapacitorSplashWhenReady } from "../lib/capacitorNativeSplash";
import { BRAND_BG } from "../constants/theme";

import { publicAssetUrl } from "../lib/publicAssetUrl";

const LOGO_SRC = publicAssetUrl("logo.png");

type Props = {
  /** Plein écran au-dessus de l’app (cold start / post-login). */
  overlay?: boolean;
};

/** Splash SPLove animé : logo + cœur en orbite (jamais un écran noir vide). */
export function SploveAnimatedSplash({ overlay = true }: Props) {
  useEffect(() => {
    hideCapacitorSplashWhenReady();
  }, []);

  return (
    <div
      className={
        overlay
          ? "fixed inset-0 z-[100] flex items-center justify-center overflow-hidden px-6"
          : "flex h-screen w-full items-center justify-center overflow-hidden px-6"
      }
      style={{
        background: "radial-gradient(ellipse 120% 80% at 50% 35%, #1a1a22 0%, #050508 52%, #030304 100%)",
      }}
      role="status"
      aria-live="polite"
      aria-label="Chargement de SPLove"
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[38%] flex justify-center opacity-[0.07]"
        aria-hidden
      >
        <div className="splove-skeleton-breathe mt-auto w-full max-w-md px-5 pb-10">
          <div className="mx-auto aspect-[3/4] w-[min(88vw,20rem)] rounded-[1.35rem] bg-white/[0.09]" />
          <div className="mx-auto mt-4 h-3 w-2/5 rounded-full bg-white/[0.08]" />
          <div className="mx-auto mt-2 h-2.5 w-1/3 rounded-full bg-white/[0.06]" />
        </div>
      </div>

      <div className="relative z-[1] flex flex-col items-center">
        <div className="relative flex h-[200px] w-[200px] items-center justify-center">
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ animation: "splovePostLoginOrbit 5.5s linear infinite" }}
            aria-hidden
          >
            <span
              className="absolute text-[1.05rem] leading-none"
              style={{
                top: "50%",
                left: "50%",
                marginTop: "-0.5em",
                marginLeft: "-0.5em",
                transform: "translateY(-76px)",
                filter: "drop-shadow(0 0 10px rgba(255,30,45,0.35))",
              }}
            >
              <span style={{ color: BRAND_BG }}>♥</span>
            </span>
          </div>
          <div
            style={{
              opacity: 0,
              animation: "splovePostLoginLogoIn 480ms ease-out forwards",
            }}
          >
            <img
              src={LOGO_SRC}
              alt=""
              width={132}
              height={132}
              className="h-[7.5rem] w-[7.5rem] max-h-[7.5rem] max-w-[7.5rem] object-contain md:h-[8.25rem] md:w-[8.25rem] md:max-h-[8.25rem] md:max-w-[8.25rem]"
              decoding="async"
              draggable={false}
              aria-hidden
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes splovePostLoginOrbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes splovePostLoginLogoIn {
          from { opacity: 0; transform: scale(0.94); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
