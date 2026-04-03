# SPLove — Plan de migration et nettoyage (profiles)

**Version :** 1.0  
**Date :** Mars 2025  
**Objectif :** Décrire ce qu’il faut faire **plus tard** pour aligner et nettoyer la table `profiles`, sans rien casser maintenant.

La migration 001 ne touche pas à `profiles`. Ce document décrit les étapes à prévoir ensuite.

---

## 1. Contexte

- La migration 001 crée uniquement `sports` et `profile_sports`.
- La table `profiles` existe déjà et contient de nombreuses colonnes.
- On ne redessine pas `profiles` maintenant ; on prévoit un plan ciblé pour plus tard.

---

## 2. Si un champ « sport » ou « sports » existe dans profiles

Objectif : migrer les données vers `profile_sports` sans supprimer tout de suite l’ancien champ.

### 2.1 Vérifier le type et le nom du champ

En base :

```sql
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND (column_name ILIKE '%sport%');
```

Exemples possibles : `sport` (TEXT), `sports` (TEXT, TEXT[], JSONB).

### 2.2 Peupler le catalogue `sports`

Avant de migrer, s’assurer que la table `sports` contient les valeurs utilisées dans les profils (noms ou slugs). Soit tu les insères à la main, soit tu les dédupliques à partir des données existantes.

Exemple (si les profils stockent des noms séparés par des virgules) :

```sql
-- Exemple : lister les valeurs distinctes (à adapter au format réel)
-- Si profiles.sports est du TEXT avec "Skate, Yoga, Run" :
/*
SELECT DISTINCT TRIM(unnest(string_to_array(sports, ','))) AS sport_name
FROM profiles
WHERE sports IS NOT NULL AND sports != '';
*/
-- Puis insérer dans sports (name + slug) les valeurs manquantes.
```

### 2.3 Script de migration des données (à exécuter plus tard)

**Ne pas exécuter tant que l’app n’est pas prête à utiliser `profile_sports`.**  
**Ne pas supprimer la colonne `profiles.sports` (ou équivalent) dans ce script.**

#### Cas 1 : `profiles.sports` est du TEXT (ex. "Skate, Yoga, Run")

```sql
-- À exécuter après avoir rempli la table sports (name cohérent avec les valeurs ci-dessous).
INSERT INTO public.profile_sports (profile_id, sport_id)
SELECT p.id, s.id
FROM public.profiles p
CROSS JOIN LATERAL unnest(string_to_array(TRIM(BOTH FROM COALESCE(p.sports, '')), ',')) AS sport_name
JOIN public.sports s ON LOWER(TRIM(s.name)) = LOWER(TRIM(sport_name))
WHERE TRIM(sport_name) != ''
ON CONFLICT (profile_id, sport_id) DO NOTHING;
```

#### Cas 2 : `profiles.sports` est du TEXT[] (array)

```sql
INSERT INTO public.profile_sports (profile_id, sport_id)
SELECT p.id, s.id
FROM public.profiles p
CROSS JOIN LATERAL unnest(COALESCE(p.sports, ARRAY[]::TEXT[])) AS sport_name
JOIN public.sports s ON LOWER(TRIM(s.name)) = LOWER(TRIM(sport_name))
WHERE TRIM(sport_name) != ''
ON CONFLICT (profile_id, sport_id) DO NOTHING;
```

#### Cas 3 : `profiles.sports` est du JSONB (ex. ["Skate", "Yoga"])

```sql
INSERT INTO public.profile_sports (profile_id, sport_id)
SELECT p.id, s.id
FROM public.profiles p
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(p.sports, '[]'::jsonb)) AS sport_name
JOIN public.sports s ON LOWER(TRIM(s.name)) = LOWER(TRIM(sport_name))
WHERE TRIM(sport_name) != ''
ON CONFLICT (profile_id, sport_id) DO NOTHING;
```

### 2.4 Ordre des opérations

| Étape | Action |
|-------|--------|
| 1 | Vérifier le nom et le type du champ sport(s) dans `profiles`. |
| 2 | Remplir `sports` avec le catalogue (noms/slugs) alignés sur les données. |
| 3 | Exécuter le script de migration ci-dessus (une seule fois, en heure creuse). |
| 4 | Vérifier les comptages : `SELECT COUNT(*) FROM profile_sports` et comparaison avec les profils qui avaient des sports. |
| 5 | Basculer l’application pour lire/écrire uniquement via `profile_sports`. |
| 6 | (Plus tard) Marquer la colonne `profiles.sports` comme dépréciée, puis la supprimer dans une migration dédiée après backup. |

---

## 3. Si profiles.id n’est pas aligné avec auth.users.id

En Supabase, on souhaite souvent que « mon profil » soit identifié par `auth.uid()`. Deux cas typiques :

- **profiles.id de type UUID et déjà rempli avec auth.uid()** : rien à faire pour l’identification.
- **profiles.id de type BIGINT (ou autre)** : il n’y a pas de lien direct entre `auth.uid()` et `profiles.id`. Les policies RLS de `profile_sports` (insert/update/delete) qui utilisent `profile_id = auth.uid()` ne matcheront pas.

### 3.1 Option A : Ajouter une colonne auth_id (recommandé si id est BIGINT)

Sans changer le type de `profiles.id` tout de suite :

| Étape | Action |
|-------|--------|
| 1 | Vérifier si la colonne existe : `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'auth_id';` |
| 2 | Si elle n’existe pas : `ALTER TABLE public.profiles ADD COLUMN auth_id UUID REFERENCES auth.users(id) UNIQUE;` |
| 3 | Remplir `auth_id` pour les lignes existantes (par exemple à partir d’une table de liaison ou du premier signup). |
| 4 | Pour les nouveaux utilisateurs : trigger ou logique applicative qui remplit `auth_id = auth.uid()` à la création du profil. |
| 5 | Adapter les policies RLS sur `profile_sports` pour « mon profil » : `profile_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid())`. |

Policies RLS à utiliser pour `profile_sports` (insert/update/delete) quand `profiles` a `auth_id` et `id` en BIGINT :

```sql
-- Exemple pour INSERT (à appliquer de la même façon pour UPDATE et DELETE)
DROP POLICY IF EXISTS "profile_sports_insert_own" ON public.profile_sports;
CREATE POLICY "profile_sports_insert_own"
  ON public.profile_sports FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid())
  );
```

### 3.2 Option B : Aligner profiles.id sur auth.users.id (changement plus lourd)

À faire seulement si tu veux un schéma où `profiles.id = auth.uid()`.

| Étape | Action |
|-------|--------|
| 1 | Créer une nouvelle table `profiles_new` avec `id UUID PRIMARY KEY DEFAULT auth.uid()`, et les colonnes souhaitées. |
| 2 | Remplir `profiles_new` à partir de `profiles` en mappant l’ancien `id` vers le bon `auth.users.id` (via `auth_id` ou autre table de liaison). |
| 3 | Migrer les tables qui référencent `profiles.id` (dont `profile_sports`) pour pointer vers les nouveaux UUID. |
| 4 | Renommer `profiles` en `profiles_old`, `profiles_new` en `profiles`. |
| 5 | Mettre à jour les FKs et les policies RLS. |

Cette option est plus risquée et à planifier soigneusement (fenêtre de maintenance, rollback).

---

## 4. Ajout de colonnes manquantes (plus tard)

### 4.1 Nouveau schéma profil (sans bio libre)

Pour le Discover et le profil SPLove, les colonnes suivantes sont utilisées :
- `sport_feeling` (TEXT) — réponse au prompt « Le sport me fait me sentir… » : vivant, libre, heureux, puissant, apaisé
- `sport_time` (TEXT) — réponse au prompt « Je pratique plutôt le sport… » : matin, midi, soir
- `main_photo_url` (TEXT) — URL de la photo principale validée

```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sport_feeling TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sport_time TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS main_photo_url TEXT;
```

### 4.2 Autres colonnes (PRD initial)

Si tu veux aligner `profiles` sur le schéma cible du PRD (first_name, gender, interested_in, intent, birth_date, city, profile_completed, updated_at), le faire dans une **migration dédiée**, après vérification explicite de ce qui existe déjà :

```sql
-- Exemple : n’ajouter que les colonnes vraiment absentes
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles';
```

Puis, pour chaque colonne cible manquante, un seul `ALTER TABLE` par colonne, avec `IF NOT EXISTS` si disponible (Postgres 9.5+ pour les colonnes, selon version) ou vérification en amont. Ne pas faire d’ajout en masse sans contrôle.

---

## 5. Suppression de colonnes dépréciées (encore plus tard)

- Ne supprimer une colonne (ex. `profiles.sports`) qu’après :
  - migration des données vers `profile_sports`,
  - bascule de l’app sur `profile_sports`,
  - période éventuelle où l’ancienne colonne n’est plus lue ni écrite.
- Toujours faire un backup avant un `DROP COLUMN`.

---

## 6. Récapitulatif

| Quand | Quoi |
|-------|------|
| **Maintenant** | Rien sur `profiles`. Uniquement migration 001 (sports + profile_sports + RLS). |
| **Plus tard (données)** | Si champ sport(s) existe : peupler `sports`, script de migration vers `profile_sports`, bascule app, puis dépréciation/suppression de l’ancienne colonne. |
| **Plus tard (auth)** | Si `profiles.id` ≠ auth : ajouter `auth_id` et adapter les RLS, ou (optionnel) migration vers `profiles.id = auth.uid()`. |
| **Plus tard (colonnes)** | Ajouter les colonnes manquantes une par une après vérification. |
| **En dernier** | Supprimer les colonnes dépréciées après backup. |

---

*Document plan de migration SPLove — profiles*
