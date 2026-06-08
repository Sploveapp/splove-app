type Props = {
  size?: number;
};

/** Logo officiel SPLove (cœur + orbite) — asset `public/logo.png`, identique AppIcon / Splash. */
const LOGO_SRC = `${import.meta.env.BASE_URL}logo.png`.replace(/\/{2,}/g, "/");

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
