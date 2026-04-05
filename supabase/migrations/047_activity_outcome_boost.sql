-- Retours après sortie réelle + boost Discover (sans affichage du score).

CREATE TYPE public.activity_feedback_sentiment AS ENUM ('positive', 'neutral', 'negative');

COMMENT ON TYPE public.activity_feedback_sentiment IS 'Retour rapide après une activité proposée';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS boost_score INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.boost_score IS 'Boost Discover — incrémenté quand deux retours « positive » sur la même proposition';

ALTER TABLE public.activity_proposals
  ADD COLUMN IF NOT EXISTS boost_awarded BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.activity_proposals.boost_awarded IS 'Évite un double boost sur la même proposition';

CREATE TABLE IF NOT EXISTS public.activity_participant_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_proposal_id UUID NOT NULL REFERENCES public.activity_proposals (id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  activity_done BOOLEAN NOT NULL DEFAULT TRUE,
  sentiment public.activity_feedback_sentiment NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_activity_outcome_proposal_participant UNIQUE (activity_proposal_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_outcomes_proposal
  ON public.activity_participant_outcomes (activity_proposal_id);

COMMENT ON TABLE public.activity_participant_outcomes IS
  'Un retour par participant et par proposition ; activity_done + sentiment';

ALTER TABLE public.activity_participant_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_outcomes_select_match" ON public.activity_participant_outcomes;
CREATE POLICY "activity_outcomes_select_match"
  ON public.activity_participant_outcomes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.activity_proposals ap
      JOIN public.matches m ON m.id = ap.match_id
      WHERE ap.id = activity_participant_outcomes.activity_proposal_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "activity_outcomes_insert_self" ON public.activity_participant_outcomes;
CREATE POLICY "activity_outcomes_insert_self"
  ON public.activity_participant_outcomes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    participant_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.activity_proposals ap
      JOIN public.matches m ON m.id = ap.match_id
      WHERE ap.id = activity_participant_outcomes.activity_proposal_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

GRANT SELECT, INSERT ON public.activity_participant_outcomes TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_mutual_positive_boost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prop RECORD;
  n_positive integer;
  ua uuid;
  ub uuid;
BEGIN
  SELECT * INTO prop FROM public.activity_proposals WHERE id = NEW.activity_proposal_id;
  IF prop.boost_awarded THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO n_positive
  FROM public.activity_participant_outcomes
  WHERE activity_proposal_id = prop.id
    AND sentiment = 'positive'::public.activity_feedback_sentiment;

  IF n_positive < 2 THEN
    RETURN NEW;
  END IF;

  SELECT m.user_a, m.user_b INTO ua, ub
  FROM public.matches m
  WHERE m.id = prop.match_id;

  IF ua IS NULL OR ub IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles SET boost_score = boost_score + 1 WHERE id IN (ua, ub);
  UPDATE public.activity_proposals SET boost_awarded = TRUE WHERE id = prop.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_outcomes_mutual_positive ON public.activity_participant_outcomes;
CREATE TRIGGER trg_activity_outcomes_mutual_positive
  AFTER INSERT ON public.activity_participant_outcomes
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_mutual_positive_boost();

COMMENT ON FUNCTION public.apply_mutual_positive_boost() IS
  'Si deux retours positive sur la même proposition, +1 boost_score pour chaque membre du match';
