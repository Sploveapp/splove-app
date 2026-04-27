import { useEffect, useMemo, useState } from "react";
import { useProfilePhotoSignedUrl } from "../hooks/useProfilePhotoSignedUrl";
import { useTranslation } from "../i18n/useTranslation";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Stored refs (not display URLs) — resolved with useProfilePhotoSignedUrl. */
  rawRefs: readonly string[];
  initialIndex: number;
  nameForAlt: string | null;
};

export function ProfilePhotoViewerModal({ isOpen, onClose, rawRefs, initialIndex, nameForAlt }: Props) {
  const { t } = useTranslation();
  const list = useMemo(
    () => rawRefs.map((r) => String(r).trim()).filter(Boolean),
    [rawRefs],
  );
  const [index, setIndex] = useState(0);
  const rawCurrent = list[index] ?? null;
  const displayUrl = useProfilePhotoSignedUrl(rawCurrent);
  const hasNav = list.length > 1;

  const listKey = list.join("\0");
  useEffect(() => {
    if (!isOpen) return;
    if (list.length === 0) return;
    setIndex(Math.min(Math.max(0, initialIndex), list.length - 1));
  }, [isOpen, initialIndex, list.length, listKey]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (!hasNav) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => (i - 1 + list.length) % list.length);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => (i + 1) % list.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, hasNav, list.length]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen || list.length === 0) return null;

  const alt = nameForAlt
    ? t("likes.photo_alt", { name: nameForAlt })
    : t("likes.profile_photo_alt");

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={t("view_photo")}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 z-30 flex h-12 min-w-[44px] items-center justify-center rounded-full bg-white/12 px-4 text-[15px] font-semibold text-white backdrop-blur-sm hover:bg-white/20"
        aria-label={t("close")}
      >
        {t("close")}
      </button>

      {hasNav ? (
        <button
          type="button"
          onClick={() => setIndex((i) => (i - 1 + list.length) % list.length)}
          className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/10 p-3 text-2xl leading-none text-white backdrop-blur-sm hover:bg-white/18 sm:left-4"
          aria-label={t("photo_viewer_previous")}
        >
          ‹
        </button>
      ) : null}
      {hasNav ? (
        <button
          type="button"
          onClick={() => setIndex((i) => (i + 1) % list.length)}
          className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/10 p-3 text-2xl leading-none text-white backdrop-blur-sm hover:bg-white/18 sm:right-4"
          aria-label={t("photo_viewer_next")}
        >
          ›
        </button>
      ) : null}

      <div
        className="flex min-h-0 flex-1 items-center justify-center p-4 pt-16"
        onClick={onClose}
        role="presentation"
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt={alt}
            className="max-h-[min(100dvh,100vh)] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="text-sm text-white/50">{t("loading")}</div>
        )}
      </div>

      {hasNav ? (
        <p className="pb-4 text-center text-xs text-white/60" aria-hidden>
          {index + 1} / {list.length}
        </p>
      ) : null}
    </div>
  );
}
