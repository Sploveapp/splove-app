-- NULL = les deux peuvent envoyer le premier message (Amical, ou Amoureux hors couple Femme/Homme strict).
-- Non NULL = seul cet utilisateur (ex. femme en rencontre amoureuse hétéro).

ALTER TABLE public.conversation_windows
  ALTER COLUMN allowed_first_sender_id DROP NOT NULL;

COMMENT ON COLUMN public.conversation_windows.allowed_first_sender_id IS
  'NULL : premier message autorisé pour les deux. Sinon UUID du seul expéditeur autorisé pour le 1er message (ex. femme en couple F/H amoureux).';
