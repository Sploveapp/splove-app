-- Table de base requise avant 001 (profile_sports), 002 (FK), etc.
-- Les colonnes sont ajoutées par les migrations suivantes (ALTER … ADD COLUMN).

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY
);
