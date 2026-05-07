-- Onboarding step 1 : présence d’enfants (optionnelle).
-- Mapping UI :
--   « Oui »                       => true
--   « Non »                       => false
--   « Je préfère ne pas répondre » => null
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_children BOOLEAN;

COMMENT ON COLUMN public.profiles.has_children IS 'true=oui, false=non, null=préfère ne pas répondre.';
