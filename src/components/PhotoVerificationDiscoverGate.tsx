import { Link } from "react-router-dom";
import {
  PHOTO_VERIFY_GATE_PENDING_BODY,
  PHOTO_VERIFY_GATE_PENDING_TITLE,
  PHOTO_VERIFY_GATE_REFRESH,
  PHOTO_VERIFY_GATE_REJECTED_BODY,
  PHOTO_VERIFY_GATE_REJECTED_FALLBACK,
  PHOTO_VERIFY_GATE_REJECTED_TITLE,
} from "../constants/copy";
import {
  collectPhotoRejectionUserMessages,
  isPhotoVerificationApproved,
} from "../lib/profileVerification";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import type { Profile } from "../contexts/AuthContext";

type Props = {
  profile: Profile;
  onRefresh: () => void;
};

/**
 * Écran interstitiel Discover tant que `photo_status` ≠ approved.
 */
export function PhotoVerificationDiscoverGate({ profile, onRefresh }: Props) {
  if (isPhotoVerificationApproved(profile.photo_status)) {
    return null;
  }

  const status = (profile.photo_status ?? "pending").toLowerCase();
  const isRejected = status === "rejected";
  const detailLines = collectPhotoRejectionUserMessages(profile);

  return (
    <div className="min-h-0 bg-app-bg font-sans">
      <main className="mx-auto max-w-md px-4 pb-8 pt-6">
        <div className="rounded-2xl border border-app-border bg-app-card px-5 py-8 text-center shadow-sm ring-1 ring-white/[0.04]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-app-muted">
            Découvrir
          </p>
          <h1 className="mt-3 text-lg font-bold leading-snug text-app-text">
            {isRejected ? PHOTO_VERIFY_GATE_REJECTED_TITLE : PHOTO_VERIFY_GATE_PENDING_TITLE}
          </h1>
          <p className="mx-auto mt-3 max-w-[22rem] text-sm leading-relaxed text-app-muted">
            {isRejected ? PHOTO_VERIFY_GATE_REJECTED_BODY : PHOTO_VERIFY_GATE_PENDING_BODY}
          </p>
          {isRejected ? (
            <div className="mx-auto mt-4 max-w-[22rem] space-y-2 text-left text-sm leading-snug text-app-text">
              {detailLines.length > 0 ? (
                <ul className="list-disc space-y-1.5 pl-5 text-app-text">
                  {detailLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-app-muted">{PHOTO_VERIFY_GATE_REJECTED_FALLBACK}</p>
              )}
            </div>
          ) : null}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => onRefresh()}
              className="rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition hover:opacity-95"
              style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
            >
              {PHOTO_VERIFY_GATE_REFRESH}
            </button>
            <Link
              to="/profile"
              className="rounded-xl border border-app-border bg-app-bg px-4 py-3 text-center text-sm font-semibold text-app-text transition hover:bg-app-border"
            >
              Mon profil
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
