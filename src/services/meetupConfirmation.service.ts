import { supabase } from "../lib/supabase";
import type { MeetupConfirmationPayload } from "../lib/meetupConfirmation";
import { buildMeetupConfirmedMessageBody } from "../lib/meetupConfirmation";

export async function saveMeetupConfirmation(input: {
  proposalId: string;
  conversationId: string;
  senderId: string;
  payload: MeetupConfirmationPayload;
}): Promise<void> {
  const { error } = await supabase
    .from("activity_proposals")
    .update({ meetup_confirmation: input.payload })
    .eq("id", input.proposalId)
    .eq("conversation_id", input.conversationId);

  if (!error) return;

  const low = (error.message ?? "").toLowerCase();
  const missingMeetupCol =
    error.code === "42703" || low.includes("meetup_confirmation") || low.includes("column");

  if (!missingMeetupCol) throw new Error(error.message || "save_meetup_confirmation_failed");

  const body = buildMeetupConfirmedMessageBody(input.payload);
  const { error: msgErr } = await supabase.from("messages").insert({
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    body,
    message_type: "text",
  });
  if (msgErr) throw new Error(msgErr.message || "save_meetup_confirmation_fallback_failed");
}
