import { useNavigate, useLocation } from "react-router-dom";
import {
  IconActivity,
  IconChatBubble,
  IconDiscover,
  IconMeet,
  IconUser,
} from "./ui/Icon";

type Props = {
  inboxCount: number;
};

export function BottomNav({ inboxCount }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  const isDiscover = path === "/" || path === "/discover";
  const isActivity = path === "/activity";
  const isMessages = path === "/messages" || path.startsWith("/chat/");
  const isLikesYou = path === "/likes-you";
  const isProfile = path === "/profile";

  return (
    <nav
      className="app-bottom-nav"
      role="navigation"
      aria-label="Navigation principale"
      style={{
        padding: "8px 12px calc(10px + env(safe-area-inset-bottom, 0px))",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "space-between",
        gap: 10,
        maxWidth: 520,
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      <button
        type="button"
        className={`app-bottom-nav__tab${isDiscover ? " app-bottom-nav__tab--active" : ""}`}
        aria-current={isDiscover ? "page" : undefined}
        aria-label="Découvrir"
        onClick={() => navigate("/discover")}
      >
        <span className="app-bottom-nav__tab-inner">
          <IconDiscover size={19} active={isDiscover} />
          <span className={`app-bottom-nav__active-dot${isDiscover ? " app-bottom-nav__active-dot--on" : ""}`} />
        </span>
      </button>
      <button
        type="button"
        className={`app-bottom-nav__tab${isActivity ? " app-bottom-nav__tab--active" : ""}`}
        aria-current={isActivity ? "page" : undefined}
        aria-label="Activité et sport"
        onClick={() => navigate("/activity")}
      >
        <span className="app-bottom-nav__tab-inner">
          <IconActivity size={19} active={isActivity} />
          <span className={`app-bottom-nav__active-dot${isActivity ? " app-bottom-nav__active-dot--on" : ""}`} />
        </span>
      </button>
      <button
        type="button"
        className={`app-bottom-nav__tab${isMessages ? " app-bottom-nav__tab--active" : ""}`}
        aria-current={isMessages ? "page" : undefined}
        aria-label={
          inboxCount > 0
            ? `Messages, ${inboxCount} conversation${inboxCount > 1 ? "s" : ""}`
            : "Messages"
        }
        onClick={() => navigate("/messages")}
      >
        <span className="app-bottom-nav__tab-inner">
          <IconChatBubble size={19} active={isMessages} />
          <span className={`app-bottom-nav__active-dot${isMessages ? " app-bottom-nav__active-dot--on" : ""}`} />
          {inboxCount > 0 ? (
            <span className="app-bottom-nav__badge" aria-hidden>
              {inboxCount > 9 ? "9+" : inboxCount}
            </span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        className={`app-bottom-nav__tab${isLikesYou ? " app-bottom-nav__tab--active" : ""}`}
        aria-current={isLikesYou ? "page" : undefined}
        aria-label="Rencontres"
        onClick={() => navigate("/likes-you")}
      >
        <span className="app-bottom-nav__tab-inner">
          <IconMeet size={19} active={isLikesYou} />
          <span className={`app-bottom-nav__active-dot${isLikesYou ? " app-bottom-nav__active-dot--on" : ""}`} />
        </span>
      </button>
      <button
        type="button"
        className={`app-bottom-nav__tab${isProfile ? " app-bottom-nav__tab--active" : ""}`}
        aria-current={isProfile ? "page" : undefined}
        aria-label="Profil"
        onClick={() => navigate("/profile")}
      >
        <span className="app-bottom-nav__tab-inner">
          <IconUser size={19} active={isProfile} />
          <span className={`app-bottom-nav__active-dot${isProfile ? " app-bottom-nav__active-dot--on" : ""}`} />
        </span>
      </button>
    </nav>
  );
}
