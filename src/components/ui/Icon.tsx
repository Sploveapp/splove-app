import type { ReactNode, SVGProps } from "react";
import {
  ICON_STROKE,
  NAV_ICON_ACTIVE,
} from "../../constants/theme";

export const ICON_STROKE_WIDTH = ICON_STROKE;

const MAX_UI_ICON = 24;
const SPL_ICON_TRANSITION: React.CSSProperties = {
  transition: "color 0.15s ease, opacity 0.15s ease, fill 0.15s ease, stroke 0.15s ease",
};

export type IconProps = Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
  size?: number;
  active?: boolean;
  color?: string;
  /** Limite la taille à 24px (désactiver pour placeholders larges si un jour wrap sur ce composant). */
  capSize?: boolean;
  children: ReactNode;
  viewBox?: string;
  title?: string;
};

function clampUiSize(n: number, cap: boolean): number {
  const v = Math.max(1, n);
  return cap ? Math.min(MAX_UI_ICON, v) : v;
}

/**
 * Conteneur SVG réutilisable : outline par défaut, traits fins.
 * Couleur : `color` > si `active === true` couleur brand > sinon `currentColor`.
 */
export function Icon({
  size = 20,
  active,
  color,
  capSize = true,
  className,
  children,
  viewBox = "0 0 24 24",
  title,
  style,
  ...rest
}: IconProps) {
  const s = clampUiSize(size, capSize);
  const resolved =
    color !== undefined ? color : active === true ? NAV_ICON_ACTIVE : undefined;

  return (
    <svg
      width={s}
      height={s}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`splove-icon ${className ?? ""}`.trim()}
      style={{
        ...SPL_ICON_TRANSITION,
        ...(resolved !== undefined ? { ...style, color: resolved } : style),
      }}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Cœur contour — navigation, listes */
export function IconHeartOutline(
  props: Omit<IconProps, "children" | "viewBox">,
) {
  return (
    <Icon {...props} viewBox="0 0 24 24">
      <path
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733C11.285 4.841 9.623 3.75 7.688 3.75 5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinejoin="round"
      />
    </Icon>
  );
}

/** Cœur plein — swipe / like actif (même silhouette que le outline, léger) */
export function IconHeartFilled(
  props: Omit<IconProps, "children" | "viewBox">,
) {
  const { active, color, style, size = 20, capSize = true, className, title, ...rest } =
    props;
  const s = clampUiSize(size, capSize);
  const resolved =
    color !== undefined ? color : active === true ? NAV_ICON_ACTIVE : undefined;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`splove-icon ${className ?? ""}`.trim()}
      style={{
        ...SPL_ICON_TRANSITION,
        ...(resolved !== undefined ? { ...style, color: resolved } : style),
      }}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        stroke="none"
        d="M12 21.35c-.35-.32-6.55-5.95-7.68-7.05C2.5 12.7 2 11.1 2 9.45 2 6.9 3.9 5 6.38 5c1.48 0 2.9.72 3.62 1.85Q12 6.5 13.99 6.85c.73-1.13 2.15-1.85 3.63-1.85C20.1 5 22 6.9 22 9.45c0 1.65-.5 3.25-1.82 4.85-1.13 1.1-7.33 6.73-7.68 7.05Z"
      />
    </svg>
  );
}

export function IconDiscover(props: Omit<IconProps, "children" | "viewBox">) {
  return (
    <Icon {...props} viewBox="0 0 24 24">
      <path
        d="M12 3.75a8.25 8.25 0 1 0 8.25 8.25A8.26 8.26 0 0 0 12 3.75Zm0 0 2.75 5.75L20.5 12l-5.75 2.5L12 20.25l-2.75-5.75L3.5 12l5.75-2.5L12 3.75Z"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

/** Filtres / affinage — barres horizontales type réglages */
export function IconFilter(props: Omit<IconProps, "children" | "viewBox">) {
  return (
    <Icon {...props} viewBox="0 0 24 24">
      <path
        d="M4 7h16M7 12h10M10 17h4"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinecap="round"
      />
      <circle cx="9" cy="7" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="17" r="1.5" fill="currentColor" />
    </Icon>
  );
}

export function IconActivity(props: Omit<IconProps, "children" | "viewBox">) {
  return (
    <Icon {...props} viewBox="0 0 24 24">
      <circle
        cx="8"
        cy="12"
        r="2.25"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        fill="none"
      />
      <path
        d="M10.25 12h3.5"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinecap="round"
      />
      <circle
        cx="16"
        cy="12"
        r="2.25"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        fill="none"
      />
    </Icon>
  );
}

/** Avion / envoi type messagerie (trait fin) */
export function IconSend(props: Omit<IconProps, "children" | "viewBox">) {
  return (
    <Icon {...props} viewBox="0 0 24 24">
      <path
        d="M22 2 11 13M22 2l-7 20-4-9-9-4 18-7Z"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinejoin="round"
      />
    </Icon>
  );
}

/** Rencontres : deux profils + lien (moins "social like", plus "mise en relation"). */
export function IconMeet(props: Omit<IconProps, "children" | "viewBox">) {
  return (
    <Icon {...props} viewBox="0 0 24 24">
      <circle
        cx="8.25"
        cy="9.25"
        r="2.5"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        fill="none"
      />
      <circle
        cx="15.75"
        cy="9.25"
        r="2.5"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        fill="none"
      />
      <path
        d="M4.75 18.75c0-2.5 1.95-4.5 4.35-4.5h5.8c2.4 0 4.35 2 4.35 4.5"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M10.8 10.9h2.4"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinecap="round"
      />
    </Icon>
  );
}

/** Silhouette tête + épaules simplifiée */
export function IconUser(props: Omit<IconProps, "children" | "viewBox">) {
  return (
    <Icon {...props} viewBox="0 0 24 24">
      <circle
        cx="12"
        cy="8.5"
        r="3.25"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        fill="none"
      />
      <path
        d="M5 20.25c0-3.45 3.15-6.25 7-6.25s7 2.8 7 6.25"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinecap="round"
        fill="none"
      />
    </Icon>
  );
}

/** Refus / pass swipe */
export function IconPass({
  className,
  size = 20,
  title,
  color,
  active,
}: Omit<IconProps, "children" | "viewBox" | "capSize"> & { capSize?: never }) {
  return (
    <Icon
      className={className}
      size={size}
      title={title}
      color={color}
      active={active}
      viewBox="0 0 24 24"
    >
      <path
        d="M7 7l10 10M17 7L7 17"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinecap="round"
      />
    </Icon>
  );
}

/**
 * Like Discover / LikesYou : contour par défaut ; `filled` pour état plein (ex. CTA).
 */
export function IconLike({
  className,
  size = 20,
  title,
  filled = false,
  color,
  active,
}: {
  className?: string;
  size?: number;
  title?: string;
  filled?: boolean;
  color?: string;
  active?: boolean;
}) {
  if (filled) {
    return (
      <IconHeartFilled
        className={className}
        size={size}
        title={title}
        color={color}
        active={active}
      />
    );
  }
  return (
    <IconHeartOutline
      className={className}
      size={size}
      title={title}
      color={color}
      active={active}
    />
  );
}

/** Rond + barre discrète (sécurité / blocage, non agressif) */
export function IconBanSoft(props: Omit<IconProps, "children" | "viewBox">) {
  return (
    <Icon {...props} viewBox="0 0 24 24">
      <circle
        cx="12"
        cy="12"
        r="7.25"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        fill="none"
      />
      <path
        d="M8.25 8.25l7.5 7.5"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinecap="round"
      />
    </Icon>
  );
}

/** Déconnexion — porte + flèche sortante */
export function IconSignOut(props: Omit<IconProps, "children" | "viewBox">) {
  return (
    <Icon {...props} viewBox="0 0 24 24">
      <path
        d="M10 5.75H7.75A2 2 0 0 0 5.75 7.75v8.5a2 2 0 0 0 2 2H10M14.5 16.5 19 12l-4.5-4.5M19 12H9"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

/** Placeholder avatar — ligne fine, lisible en grand */
export function IconAvatarPlaceholder({
  className,
  size = 88,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`splove-icon ${className ?? ""}`.trim()}
      style={SPL_ICON_TRANSITION}
      aria-hidden
    >
      <circle
        cx="32"
        cy="22"
        r="11"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        fill="none"
        opacity={0.4}
      />
      <path
        d="M14 52c0-9.5 8.05-17 18-17s18 7.5 18 17"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinecap="round"
        fill="none"
        opacity={0.4}
      />
    </svg>
  );
}

/** Check dans cercle fin (vérifié) */
export function IconVerifiedMark({
  className,
  size = 18,
}: {
  className?: string;
  size?: number;
}) {
  const s = Math.min(MAX_UI_ICON, Math.max(1, size));
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`splove-icon ${className ?? ""}`.trim()}
      style={SPL_ICON_TRANSITION}
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        fill="none"
      />
      <path
        d="M8 12.25l2.25 2.25L16 9"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Liste d’avantages (paywall, etc.) */
export function IconFeatureCheck({
  className,
  size = 22,
}: {
  className?: string;
  size?: number;
}) {
  const s = Math.min(MAX_UI_ICON, Math.max(1, size));
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`splove-icon ${className ?? ""}`.trim()}
      style={SPL_ICON_TRANSITION}
      aria-hidden
    >
      <path
        d="M9 12.25l1.85 1.85L15.25 9.7"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="4"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        fill="none"
      />
    </svg>
  );
}

/** Œil — afficher le mot de passe */
export function IconEye(props: Omit<IconProps, "children" | "viewBox">) {
  return (
    <Icon {...props} viewBox="0 0 24 24">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} fill="none" />
    </Icon>
  );
}

/** Œil barré — masquer le mot de passe (même silhouette + trait) */
export function IconEyeOff(props: Omit<IconProps, "children" | "viewBox">) {
  return (
    <Icon {...props} viewBox="0 0 24 24">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} fill="none" />
      <path
        d="M4 4l16 16"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinecap="round"
      />
    </Icon>
  );
}

/** Bulle message (réutilisable) */
export function IconChatBubble(props: Omit<IconProps, "children" | "viewBox">) {
  return (
    <Icon {...props} size={props.size ?? 22} viewBox="0 0 24 24">
      <path
        d="M5 9a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-3.2L10 20.25V17H8a3 3 0 0 1-3-3V9Z"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M8.5 10h7M8.5 12.5h4.5"
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
        strokeLinecap="round"
      />
    </Icon>
  );
}

/** Alias historique */
export const IconProfileAvatarPlaceholder = IconAvatarPlaceholder;
