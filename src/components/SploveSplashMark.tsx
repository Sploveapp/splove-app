import { publicAssetUrl } from "../lib/publicAssetUrl";

type Props = {
  size?: number;
};

/** Logo officiel SPLove (cœur + orbite) — asset `public/logo.png`, identique AppIcon / Splash. */
const LOGO_SRC = publicAssetUrl("logo.png");

export function SploveSplashMark({ size = 112 }: Props) {
  return (
    <img
      src={LOGO_SRC}
      alt=""
      aria-hidden
      width={size}
      height={size}
      decoding="async"
      draggable={false}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
      }}
    />
  );
}
