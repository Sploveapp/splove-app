-- Compte : pause / désactivation produit (Discover, etc. peuvent filtrer sur ces colonnes).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.profiles.is_paused IS 'Utilisateur a mis son compte en pause.';
COMMENT ON COLUMN public.profiles.is_active IS 'Compte actif — false = désactivation (sans suppression Auth).';
