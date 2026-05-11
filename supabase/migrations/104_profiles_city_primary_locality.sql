-- Réduit `profiles.city` à la première localité (ex. Nominatim display_name / chaînes concaténées).
-- Les coordonnées latitude/longitude ne sont pas modifiées.

UPDATE public.profiles
SET city = NULLIF(
  trim(
    both
    ' '
    FROM
      split_part(
        replace(replace(replace(city, E'\uFF0C', ','), '，', ','), ';', ','),
        ',',
        1
      )
  ),
  ''
)
WHERE
  city IS NOT NULL
  AND (
    position(',' IN city) > 0
    OR position(';' IN city) > 0
    OR position(E'\uFF0C' IN city) > 0
    OR position('，' IN city) > 0
  );
