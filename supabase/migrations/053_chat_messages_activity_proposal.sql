-- Messages typés : créneau + réponse, liés à activity_proposals.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS activity_proposal_id UUID REFERENCES public.activity_proposals (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN public.messages.message_type IS 'text | activity_proposal | activity_proposal_response';
COMMENT ON COLUMN public.messages.activity_proposal_id IS 'Référence proposition (créneau ou réponse)';
COMMENT ON COLUMN public.messages.metadata IS 'Champs affichage / contexte (sport_label, location_label, scheduled_at_label, response, etc.)';

CREATE INDEX IF NOT EXISTS idx_messages_activity_proposal_id ON public.messages (activity_proposal_id)
  WHERE activity_proposal_id IS NOT NULL;
