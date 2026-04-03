-- Tout utilisateur Auth doit avoir profiles.id = auth.users.id (aucun UUID aléatoire côté profil).

INSERT INTO public.profiles (id, profile_completed)
SELECT u.id, false
FROM auth.users AS u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles AS p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;
