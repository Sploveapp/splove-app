import React, { useState } from "react";
import type { CSSProperties } from "react";

// Place `heart-orbit.png` in `public/` (served as `${BASE_URL}heart-orbit.png`). If missing, the fallback (♥) is shown.
const HEART_ORBIT_PUBLIC_URL = `${import.meta.env.BASE_URL}heart-orbit.png`.replace(/\/{2,}/g, "/");

export type MatchScreenV2Props = {
  leftProfileUri?: string | null;
  rightProfileUri?: string | null;
  onPressSendMessage?: () => void;
};

function CircularImage({
  uri,
  style,
}: {
  uri: string | null | undefined;
  style?: CSSProperties;
}): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const useRemote = Boolean(uri) && !failed;

  return (
    <div style={{ ...styles.avatar, ...style }}>
      {useRemote ? (
        <img
          src={uri as string}
          alt=""
          style={styles.avatarImage}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}

export default function MatchScreen_v2({
  leftProfileUri,
  rightProfileUri,
  onPressSendMessage,
}: MatchScreenV2Props): React.ReactElement {
  const [logoFailed, setLogoFailed] = useState(false);
  const [buttonPressed, setButtonPressed] = useState(false);

  return (
    <div style={styles.root}>
      <div style={styles.content}>
        <p style={styles.title}>C’est un match.</p>
        <p style={styles.subtitle}>Passe à l’action.</p>

        <div style={styles.avatarsRow}>
          <CircularImage uri={leftProfileUri} style={styles.avatarLeft} />
          <div style={styles.logoSlot}>
            {logoFailed ? (
              <div style={styles.logoFallback}>
                <span style={styles.logoFallbackText}>♥</span>
              </div>
            ) : (
              <img
                src={HEART_ORBIT_PUBLIC_URL}
                alt=""
                style={styles.logo}
                onError={() => setLogoFailed(true)}
              />
            )}
          </div>
          <CircularImage uri={rightProfileUri} style={styles.avatarRight} />
        </div>

        <button
          type="button"
          style={{
            ...styles.button,
            ...(buttonPressed ? styles.buttonPressed : null),
          }}
          onClick={onPressSendMessage}
          onPointerDown={() => setButtonPressed(true)}
          onPointerUp={() => setButtonPressed(false)}
          onPointerCancel={() => setButtonPressed(false)}
          onPointerLeave={() => setButtonPressed(false)}
        >
          <span style={styles.buttonLabel}>Envoyer un message</span>
        </button>
      </div>
    </div>
  );
}

const AVATAR = 112;
const LOGO = 80;

const styles: Record<string, CSSProperties> = {
  root: {
    flex: 1,
    minHeight: "100vh",
    backgroundColor: "#0B0B0F",
  },
  content: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    paddingLeft: 24,
    paddingRight: 24,
    paddingTop: 56,
    alignItems: "center",
  },
  title: {
    margin: 0,
    color: "#F5F5F7",
    fontSize: 28,
    fontWeight: 700,
    textAlign: "center",
  },
  subtitle: {
    margin: 0,
    marginTop: 10,
    color: "rgba(245, 245, 247, 0.64)",
    fontSize: 16,
    textAlign: "center",
  },
  avatarsRow: {
    marginTop: 48,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: "#1C1C24",
    border: "2px solid rgba(255, 255, 255, 0.10)",
    overflow: "hidden",
  },
  avatarLeft: {
    marginRight: -18,
  },
  avatarRight: {
    marginLeft: -18,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  logoSlot: {
    width: LOGO,
    height: LOGO,
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: LOGO,
    height: LOGO,
    objectFit: "contain",
    display: "block",
  },
  logoFallback: {
    width: LOGO,
    height: LOGO,
    borderRadius: LOGO / 2,
    backgroundColor: "#2A1020",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallbackText: {
    color: "#FF6B9A",
    fontSize: 32,
  },
  button: {
    marginTop: 48,
    width: "100%",
    maxWidth: 400,
    paddingTop: 16,
    paddingBottom: 16,
    borderRadius: 14,
    backgroundColor: "#F5F5F7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    cursor: "pointer",
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonLabel: {
    color: "#0B0B0F",
    fontSize: 16,
    fontWeight: 600,
  },
};
