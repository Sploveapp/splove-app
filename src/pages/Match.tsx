import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { ActivityProposalModal } from "../components/ActivityProposalModal";
import { PriorityProposalUpsell } from "../components/PriorityProposalUpsell";
import type { ActivityPayload } from "../lib/chatActivity";
import { COPY_BANNER_48H, computeProposalSchedule, touchMatchOpenedAt } from "../lib/chatActivity";
import { ensureConversationWindow } from "../lib/ensureConversationWindow";

export type MatchLocationState = {
  partnerFirstName?: string | null;
  /** Photo principale du match (même source que Discover : `main_photo_url`). */
  partnerMainPhotoUrl?: string | null;
  /** User qui a déclenché le match (2e like côté RPC). */
  matchedByUserId?: string | null;
  sharedSports?: string[];
};

export default function Match() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const state = (location.state ?? null) as MatchLocationState | null;
  const partnerName = state?.partnerFirstName?.trim() || null;
  const partnerPhoto = state?.partnerMainPhotoUrl?.trim() || null;
  const matchedByUserId = state?.matchedByUserId ?? null;
  const sharedSports = state?.sharedSports ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [activeProposalStatus, setActiveProposalStatus] = useState<string | null>(null);

  useEffect(() => {
    if (conversationId) touchMatchOpenedAt(conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !user?.id) return;
    void ensureConversationWindow({
      conversationId,
      userId: user.id,
      matchedByUserId,
    });
  }, [conversationId, matchedByUserId, user?.id]);

  useEffect(() => {
    async function loadActiveProposal() {
      if (!conversationId) return;
      const { data } = await supabase
      .from("activity_proposals")
      .select("id")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
      
      setActiveProposalStatus((data as { id?: string } | null)?.id ? "exists" : null);
    }
    void loadActiveProposal();
  }, [conversationId, modalOpen]);

  if (!conversationId) {
    return (
      <div className="p-6 text-center text-sm text-red-600">
        Conversation introuvable.
      </div>
    );
  }

  async function sendActivity(payload: ActivityPayload) {
    if (!user?.id) throw new Error("Non connecté");
    const { data: activeProposal, error: activeErr } = await supabase
      .from("activity_proposals")
      .select("id")
      .eq("conversation_id", conversationId)
      .limit(1)
      .maybeSingle();
    if (activeErr) throw new Error(activeErr.message);
    if (activeProposal?.id) {
      return;
    }

    const { timeLabel } = computeProposalSchedule(payload.when);

    const { error: proposalErr } = await supabase.from("activity_proposals").insert({
      conversation_id: conversationId,
      proposer_id: user.id,
      sport: payload.sport,
      time_slot: timeLabel,
      location: payload.place.trim() || "À définir",
      note: payload.message.trim() || null,
    });
    if (proposalErr) throw new Error(proposalErr.message);
  }

  function goChat() {
    try {
      sessionStorage.setItem(
        `splove_conv_sports_${conversationId}`,
        JSON.stringify(sharedSports)
      );
    } catch {
      /* ignore quota */
    }
    navigate(`/chat/${conversationId}`, {
      replace: true,
      state: {
        partnerFirstName: partnerName,
        partnerMainPhotoUrl: partnerPhoto,
        sharedSports,
        matchedByUserId,
      },
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg font-sans">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <div className="rounded-3xl border border-app-border bg-app-card px-6 py-10 text-center shadow-sm ring-1 ring-app-border">
          {partnerPhoto && (
            <div className="mx-auto w-28 overflow-hidden rounded-2xl ring-2 ring-app-border">
              <img
                src={partnerPhoto}
                alt={partnerName ? `Photo de ${partnerName}` : "Photo du profil"}
                className="aspect-[3/4] h-full w-full object-cover"
              />
            </div>
          )}
          <h1 className="mt-5 text-[1.35rem] font-bold leading-snug tracking-tight text-app-text sm:text-2xl">
            Ça match. Maintenant, faites que ça existe.
          </h1>
          {partnerName && (
            <p className="mt-2 text-[15px] text-app-muted">
              Avec {partnerName}
              {sharedSports.length > 0 ? ` · ${sharedSports.slice(0, 2).join(", ")}` : ""}
            </p>
          )}
          <p className="mt-5 text-[15px] font-medium leading-relaxed text-app-text">{COPY_BANNER_48H}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-app-muted">
            Un créneau concret, puis le reste suit — le chat reste ouvert quand vous voulez.
          </p>
          {activeProposalStatus && (
            <p className="mt-3 inline-flex rounded-full bg-[#FF1E2D]/10 px-3 py-1 text-[12px] font-semibold text-[#FF1E2D]">
              Proposition d’activité en cours
            </p>
          )}

          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="w-full rounded-2xl py-3.5 text-[15px] font-bold shadow-md transition hover:opacity-95"
              style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
            >
              Proposer un moment
            </button>
            <button
              type="button"
              onClick={goChat}
              className="w-full rounded-2xl border border-app-border bg-app-card py-3.5 text-[15px] font-semibold text-app-text hover:bg-app-border"
            >
              Discuter avant
            </button>
          </div>
          <div className="mt-4 text-left">
            <PriorityProposalUpsell
              onActivate={() => navigate("/splove-plus")}
              onStayFree={() => goChat()}
            />
          </div>
        </div>
      </main>

      <ActivityProposalModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        sharedSports={sharedSports}
        onSubmit={async (p) => {
          await sendActivity(p);
          goChat();
        }}
      />
    </div>
  );
}
