-- =============================================
-- SPLove — Bio structurée (pas de bio libre)
-- =============================================
-- Personnalité sport : moment, motivations, phrase courte.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sport_time TEXT,
  ADD COLUMN IF NOT EXISTS sport_motivation TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sport_phrase TEXT;

COMMENT ON COLUMN public.profiles.sport_time IS 'Quand préfère faire du sport : Matin, Midi, Soir, Week-end';
COMMENT ON COLUMN public.profiles.sport_motivation IS 'Ce qu''il aime dans le sport (multi) : Se dépasser, La nature, etc.';
COMMENT ON COLUMN public.profiles.sport_phrase IS 'Phrase sport en une ligne (max 120 caractères)';
