-- Preferred UI locale (mirror of client `splove_language`).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS language TEXT;
