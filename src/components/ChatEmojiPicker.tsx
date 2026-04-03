import { useEffect, useRef, useState } from "react";

/** Grille courte et lisible — pas de lib lourde, bundle minimal. */
const EMOJI_PICKER_GRID: readonly string[] = [
  "😀",
  "😊",
  "😂",
  "🥰",
  "😍",
  "🤩",
  "😎",
  "🙃",
  "😉",
  "🤗",
  "🙂",
  "😇",
  "🥲",
  "😘",
  "😋",
  "😏",
  "👍",
  "👎",
  "👌",
  "🤝",
  "🙏",
  "👋",
  "💪",
  "✌️",
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🔥",
  "✨",
  "🎉",
  "💯",
  "⚽",
  "🏀",
  "🎾",
  "🏃",
  "🚴",
  "🧘",
  "☀️",
  "🌙",
  "⭐",
  "💬",
  "🙌",
  "👀",
  "💦",
  "🎯",
];

type Props = {
  disabled?: boolean;
  /** Insère l’emoji dans le message ; le texte existant est conservé côté parent. */
  onEmojiSelect: (emoji: string) => void;
};

/**
 * Un bouton emoji + popover grille — UX type messagerie, sans dépendance npm.
 */
export function ChatEmojiPicker({ disabled, onEmojiSelect }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Ouvrir le sélecteur d’emojis"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-app-border bg-app-card text-[22px] leading-none text-app-text shadow-sm transition hover:bg-app-border hover:border-app-border disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#FF1E2D]/25 focus:ring-offset-1"
      >
        <span aria-hidden>😊</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Emojis"
          className="absolute bottom-full left-0 z-[60] mb-2 w-[min(calc(100vw-2rem),280px)] rounded-2xl border border-app-border/95 bg-app-card p-2 shadow-xl ring-1 ring-black/20"
        >
          <div className="max-h-[min(40vh,220px)] overflow-y-auto overscroll-contain pr-0.5">
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJI_PICKER_GRID.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[1.15rem] leading-none transition hover:bg-app-border active:scale-95"
                  onClick={() => {
                    onEmojiSelect(emoji);
                  }}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
