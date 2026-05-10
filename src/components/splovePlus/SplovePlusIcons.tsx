import { type ReactNode } from "react";

/**
 * Famille graphique partagée des pictogrammes SPLove+.
 *
 * Contraintes pour rester cohérent avec la navbar principale (Pulse / Likes /
 * Messages / Profil) :
 *  - viewBox 24, fill="none", trait 1.65, capuchons et jonctions arrondis.
 *  - aucun remplissage massif, aucun glow, aucun style cartoon.
 *  - aucune animation auto, sauf l'orbite du Rappel intelligent et le spinner
 *    d'activation, tous deux désactivés sous prefers-reduced-motion (CSS posé
 *    par les écrans qui les utilisent).
 */
export const SPLOVE_PLUS_ICON_STROKE = 1.65;

export type SploveIconProps = { color?: string; size?: number };
export type SploveIconRenderer = (props?: SploveIconProps) => ReactNode;

export function SploveIconShell({
  children,
  color = "currentColor",
  size = 18,
}: SploveIconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={SPLOVE_PLUS_ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Boost — double chevron ascendant : impulsion / accélération sans cliché fusée. */
export function SploveBoostIcon(props: SploveIconProps = {}) {
  return (
    <SploveIconShell {...props}>
      <path d="M5.5 14.5 L12 8 L18.5 14.5" />
      <path d="M5.5 19.5 L12 13 L18.5 19.5" />
    </SploveIconShell>
  );
}

/** Coup franc — bulle minimale avec point central, distincte de l'onglet Messages. */
export function SploveChatBubbleIcon(props: SploveIconProps = {}) {
  const dotColor = props.color ?? "currentColor";
  return (
    <SploveIconShell {...props}>
      <path d="M5 6.5 H17.5 A2.4 2.4 0 0 1 19.9 8.9 V14.5 A2.4 2.4 0 0 1 17.5 16.9 H11 L7.5 19.5 V16.9 H5 A2.4 2.4 0 0 1 2.6 14.5 V8.9 A2.4 2.4 0 0 1 5 6.5 Z" />
      <circle cx="12" cy="11.7" r="0.55" fill={dotColor} stroke="none" />
    </SploveIconShell>
  );
}

/** Retour — flèche rewind (cohérent avec l'item Retour de la navbar). */
export function SploveUndoArrowIcon(props: SploveIconProps = {}) {
  return (
    <SploveIconShell {...props}>
      <path d="M17.95 17.42A7.4 7.4 0 0 1 7.6 7.16 7.4 7.4 0 0 1 14.4 3.4" />
      <path d="M15.2 3.15h3.9v3.9" />
    </SploveIconShell>
  );
}

/** Mode discret — œil barré, premium et silencieux, sans fantôme cartoon. */
export function SploveDiscreetIcon(props: SploveIconProps = {}) {
  return (
    <SploveIconShell {...props}>
      <path d="M3.5 12c2-4 5.5-6 9-6 1.6 0 3.1 0.4 4.4 1.2" />
      <path d="M20.5 12c-2 4-5.5 6-9 6-1.6 0-3.1-0.4-4.4-1.2" />
      <path d="M9.9 9.9 a3 3 0 0 0 4.2 4.2" />
      <path d="M4.5 4.5 L19.5 19.5" />
    </SploveIconShell>
  );
}

/** Priorité rencontre — éclair outline dynamique. */
export function SploveLightningIcon(props: SploveIconProps = {}) {
  return (
    <SploveIconShell {...props}>
      <path d="M13.5 3 L6.5 13 H11 L10 21 L17.5 11 H13 Z" />
    </SploveIconShell>
  );
}

/** Lieux communs — point de rencontre élégant : pin + cercle social central. */
export function SplovePinIcon(props: SploveIconProps = {}) {
  return (
    <SploveIconShell {...props}>
      <path d="M12 21.5s7-6.5 7-11.5 a7 7 0 1 0 -14 0 c0 5 7 11.5 7 11.5 Z" />
      <circle cx="12" cy="10" r="2.4" />
    </SploveIconShell>
  );
}

/**
 * Rappel intelligent — orbite + comète, écho du logo SPLove (pas de cloche).
 * La comète pulse subtilement via la keyframe `sploveOrbitCometPulse` posée
 * par l'écran qui consomme l'icône. Désactivable via prefers-reduced-motion.
 */
export function SploveOrbitPulseIcon(props: SploveIconProps = {}) {
  const cometColor = props.color ?? "currentColor";
  return (
    <SploveIconShell {...props}>
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-22 12 12)" />
      <circle cx="12" cy="12" r="2.4" />
      <circle
        cx="19.6"
        cy="9"
        r="1.1"
        fill={cometColor}
        stroke="none"
        style={{
          transformBox: "fill-box",
          transformOrigin: "center",
          animation: "sploveOrbitCometPulse 2400ms ease-in-out infinite",
        }}
      />
    </SploveIconShell>
  );
}

/** Étincelle — accent « Recommandé », remplace l'emoji native en accent premium. */
export function SploveSparkIcon(props: SploveIconProps = {}) {
  return (
    <SploveIconShell {...props}>
      <path d="M12 3 L13.4 10.6 L21 12 L13.4 13.4 L12 21 L10.6 13.4 L3 12 L10.6 10.6 Z" />
    </SploveIconShell>
  );
}

/**
 * Spinner d'activation : arc minimal qui tourne en continu, dans la même
 * famille graphique que les autres pictogrammes Splove+ (outline, trait 1.65,
 * sans glow). Utilisé pour l'état « Activation… » du CTA premium.
 */
export function SploveActivatingSpinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={SPLOVE_PLUS_ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transformOrigin: "center",
        animation: "sploveActivatingSpin 900ms linear infinite",
      }}
    >
      <path d="M12 3 a9 9 0 1 1 -9 9" />
    </svg>
  );
}

/**
 * Keyframes globales : à inclure une fois (côté écran) pour activer la
 * pulsation de la comète et la rotation du spinner. Coupées proprement
 * sous prefers-reduced-motion.
 */
export const SPLOVE_PLUS_ICON_KEYFRAMES = `
  @keyframes sploveOrbitCometPulse {
    0%, 100% { transform: scale(1); opacity: 0.85; }
    50% { transform: scale(1.25); opacity: 1; }
  }
  @keyframes sploveActivatingSpin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    [style*="sploveOrbitCometPulse"],
    [style*="sploveActivatingSpin"] { animation: none !important; }
  }
`;
