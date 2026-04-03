-- Sécurise likes (from_user / to_user) : pas d’auto-like, une seule ligne par paire.
-- Idempotent si la migration 003 a déjà été appliquée. Ignoré si la table utilise d’autres colonnes.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'likes' AND column_name = 'from_user'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'likes' AND column_name = 'to_user'
  ) THEN
    ALTER TABLE public.likes DROP CONSTRAINT IF EXISTS likes_no_self;
    BEGIN
      ALTER TABLE public.likes
        ADD CONSTRAINT likes_no_self CHECK (from_user <> to_user);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER TABLE public.likes
        ADD CONSTRAINT likes_pair_unique UNIQUE (from_user, to_user);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
