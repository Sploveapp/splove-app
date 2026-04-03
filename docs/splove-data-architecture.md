# SPLove — Architecture de données (sports & matching)

**Version :** 1.0  
**Date :** Mars 2025  
**Objectif :** Schéma propre, sport comme entité centrale, migration sans casser l’existant.

---

## 1. Schéma cible

### 1.1 Tables principales

| Table | Rôle |
|-------|------|
| **profiles** | Un enregistrement par utilisateur (données perso + préférences) |
| **sports** | Catalogue des sports (entité centrale, partagée) |
| **profile_sports** | Table de liaison N–N : quels sports par profil, avec niveau optionnel |

### 1.2 Colonnes détaillées

**profiles**
- `id` — identifiant (UUID recommandé, aligné `auth.users.id` à terme)
- `first_name` — prénom
- `gender` — genre
- `interested_in` — attirance (pour le matching)
- `intent` — type de rencontre (amical / amoureux)
- `birth_date` — date de naissance
- `city` — ville
- `bio` — texte libre
- `profile_completed` — booléen (profil rempli pour le feed)
- `created_at`, `updated_at` — timestamps

**sports**
- `id` — PK (serial ou uuid)
- `name` — libellé (ex. "Skateboard")
- `slug` — identifiant URL (ex. "skateboard")
- `created_at`

**profile_sports**
- `id` — PK
- `profile_id` — FK → profiles
- `sport_id` — FK → sports
- `level` — niveau optionnel (débutant, intermédiaire, avancé, etc.)
- `created_at`

---

## 2. SQL — Création / ajustement des tables

### 2.1 Extension et types (optionnel)

```sql
-- Activer l'extension UUID si besoin (souvent déjà fait sur Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Type pour le niveau (optionnel, évite les typos)
DO $$ BEGIN
  CREATE TYPE sport_level AS ENUM ('beginner', 'intermediate', 'advanced', 'expert');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
```

### 2.2 Table `sports`

À créer en premier (aucune dépendance).

```sql
-- =============================================
-- Table: sports (catalogue)
-- =============================================
CREATE TABLE IF NOT EXISTS public.sports (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unicité du slug (évite doublons)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sports_slug ON public.sports (LOWER(TRIM(slug)));

-- Index pour recherche par nom
CREATE INDEX IF NOT EXISTS idx_sports_name_lower ON public.sports (LOWER(TRIM(name)));

COMMENT ON TABLE public.sports IS 'Catalogue des sports SPLove — entité centrale pour le matching';
```

### 2.3 Table `profiles` (création ou ajustement)

Deux cas : **A** la table n’existe pas, **B** elle existe déjà.

**A — Création from scratch**

```sql
-- =============================================
-- Table: profiles (si elle n'existe pas)
-- =============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name        TEXT,
  gender            TEXT,
  interested_in     TEXT,
  intent            TEXT,
  birth_date        DATE,
  city              TEXT,
  bio               TEXT,
  profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_profile_completed ON public.profiles (profile_completed) WHERE profile_completed = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_intent ON public.profiles (intent);
CREATE INDEX IF NOT EXISTS idx_profiles_birth_date ON public.profiles (birth_date);
```

**B — La table existe déjà**

Ne pas supprimer de colonnes. Ajouter uniquement les colonnes manquantes (avec `IF NOT EXISTS` ou `ADD COLUMN IF NOT EXISTS` selon la version de Postgres). Exemple :

```sql
-- Ajouter uniquement les colonnes manquantes (à adapter selon ton schéma actuel)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS interested_in TEXT,
  ADD COLUMN IF NOT EXISTS intent TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Mettre à jour updated_at automatiquement (trigger)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

Si `profiles.id` est en `BIGSERIAL` aujourd’hui, on ne change pas encore le type : voir section 7 (alignement avec `auth.users.id`).

### 2.4 Table `profile_sports`

À créer après `profiles` et `sports`.

```sql
-- =============================================
-- Table: profile_sports (liaison N–N)
-- =============================================
CREATE TABLE IF NOT EXISTS public.profile_sports (
  id         BIGSERIAL PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sport_id   BIGINT NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  level      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, sport_id)
);

-- Index pour le feed : "tous les profils qui ont au moins un sport en commun"
CREATE INDEX IF NOT EXISTS idx_profile_sports_profile_id ON public.profile_sports (profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_sports_sport_id ON public.profile_sports (sport_id);

-- Index composite pour la requête de matching (profils partageant un sport)
CREATE INDEX IF NOT EXISTS idx_profile_sports_sport_profile ON public.profile_sports (sport_id, profile_id);

COMMENT ON TABLE public.profile_sports IS 'Sports pratiqués par profil — au moins un en commun pour apparaître dans le feed';
```

Si `profiles.id` est encore en `BIGINT` (serial), remplacer `UUID` par `BIGINT` et `REFERENCES public.profiles(id)` en conséquence.

---

## 3. Clés primaires et étrangères

| Table | Clé primaire | Clés étrangères |
|-------|--------------|-----------------|
| **profiles** | `id` (UUID ou BIGINT) | — |
| **sports** | `id` (BIGSERIAL) | — |
| **profile_sports** | `id` (BIGSERIAL) | `profile_id` → profiles(id), `sport_id` → sports(id) |

Contraintes :
- `ON DELETE CASCADE` sur `profile_sports` : si un profil ou un sport est supprimé, les lignes liées sont supprimées.
- Unicité `(profile_id, sport_id)` : un même sport ne peut être ajouté qu’une fois par profil.

---

## 4. Index utiles

| Index | Table | Usage |
|-------|--------|--------|
| `idx_sports_slug` (UNIQUE) | sports | Lookup par slug, dédoublonnage |
| `idx_sports_name_lower` | sports | Recherche par nom |
| `idx_profiles_profile_completed` | profiles | Feed : seulement profils complétés |
| `idx_profiles_intent` | profiles | Filtre par type de rencontre |
| `idx_profiles_birth_date` | profiles | Filtre âge (calcul côté app ou SQL) |
| `idx_profile_sports_profile_id` | profile_sports | Liste des sports d’un profil |
| `idx_profile_sports_sport_id` | profile_sports | Tous les profils pour un sport |
| `idx_profile_sports_sport_profile` | profile_sports | Requête “profils avec au moins un sport en commun” |

Requête type pour le feed (profils compatibles = au moins un sport en commun) :

```sql
SELECT DISTINCT p.*
FROM profiles p
JOIN profile_sports ps ON ps.profile_id = p.id
WHERE ps.sport_id IN (
  SELECT sport_id FROM profile_sports WHERE profile_id = :current_user_profile_id
)
AND p.id != :current_user_profile_id
AND p.profile_completed = TRUE
-- + filtres intent, âge, etc.
```

Les index `profile_sports(sport_id, profile_id)` et `profile_sports(profile_id)` servent directement cette requête.

---

## 5. Contraintes d’unicité

| Contrainte | Table | Détail |
|------------|--------|--------|
| `UNIQUE (profile_id, sport_id)` | profile_sports | Un sport une fois par profil |
| `UNIQUE (LOWER(TRIM(slug)))` | sports | Slug unique (via index unique) |

Optionnel : contraintes `CHECK` sur `profiles` (gender, intent, interested_in) pour limiter les valeurs autorisées.

---

## 6. Politiques RLS minimales (MVP)

On suppose que RLS est activé sur les tables concernées.

### 6.1 `profiles`

- **SELECT** : tout le monde (authentifié) peut voir les profils des autres (pour Discover).
- **INSERT** : uniquement son propre profil (id = auth.uid() si id = auth.users.id).
- **UPDATE** : uniquement son propre profil.
- **DELETE** : uniquement son propre profil (ou désactivé en MVP).

```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Lecture : tout utilisateur authentifié peut voir les profils (feed)
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Insert : uniquement pour son propre id (si profiles.id = auth.uid())
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Update : uniquement son propre profil
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Delete : uniquement son propre profil (optionnel)
CREATE POLICY "profiles_delete_own"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (id = auth.uid());
```

Si `profiles.id` n’est pas encore `auth.uid()`, il faut une colonne `auth_id UUID REFERENCES auth.users(id)` et utiliser `auth_id = auth.uid()` dans les politiques.

### 6.2 `sports`

- Lecture seule pour les utilisateurs authentifiés.
- Écriture réservée au rôle `service_role` ou à un admin (pas d’policy INSERT/UPDATE/DELETE pour `authenticated` en MVP).

```sql
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sports_select_authenticated"
  ON public.sports FOR SELECT
  TO authenticated
  USING (true);
```

### 6.3 `profile_sports`

- **SELECT** : tout authentifié (pour afficher les sports des profils).
- **INSERT / UPDATE / DELETE** : uniquement pour les lignes dont le `profile_id` est le profil de l’utilisateur connecté.

```sql
ALTER TABLE public.profile_sports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_sports_select_authenticated"
  ON public.profile_sports FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profile_sports_insert_own"
  ON public.profile_sports FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "profile_sports_update_own"
  ON public.profile_sports FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "profile_sports_delete_own"
  ON public.profile_sports FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid());
```

Là encore, si le profil n’est pas lié par `id = auth.uid()`, utiliser une colonne `auth_id` sur `profiles` et une sous-requête du type `profile_id IN (SELECT id FROM profiles WHERE auth_id = auth.uid())`.

---

## 7. Stratégie de migration

### 7.1 Si un champ “sports” existe déjà dans `profiles`

Hypothèses possibles : colonne `sports` en `TEXT`, `TEXT[]`, ou `JSONB`.

**Principe : pas de suppression immédiate.**

| Étape | Action |
|-------|--------|
| 1 | Créer les tables `sports` et `profile_sports` (comme ci-dessus). |
| 2 | Peupler `sports` avec le catalogue (noms/slugs). |
| 3 | Script de migration des données : pour chaque profil ayant `sports` non vide, parser la valeur (split par virgule, ou array, ou JSON), faire correspondre à un `sport_id` (par nom ou slug), insérer dans `profile_sports`. |
| 4 | Une fois la migration validée (et l’app basculée sur `profile_sports`), marquer la colonne `profiles.sports` comme dépréciée. |
| 5 | Plus tard : supprimer la colonne `profiles.sports` dans une migration dédiée, après backup. |

Exemple de migration (si `profiles.sports` est du texte séparé par des virgules) :

```sql
-- À exécuter après création de sports et profile_sports, et après avoir rempli sports.
-- Adapter selon le type réel de profiles.sports (text, text[], jsonb).

INSERT INTO public.profile_sports (profile_id, sport_id)
SELECT p.id, s.id
FROM public.profiles p
CROSS JOIN LATERAL unnest(string_to_array(TRIM(BOTH FROM p.sports), ',')) AS sport_name
JOIN public.sports s ON LOWER(TRIM(s.name)) = LOWER(TRIM(sport_name))
ON CONFLICT (profile_id, sport_id) DO NOTHING;
```

Adapter si la colonne est `TEXT[]` (unnest directement sur `p.sports`) ou `JSONB`.

**À faire maintenant :** créer `sports` et `profile_sports`, ajouter le script de migration des données.  
**À migrer ensuite :** faire tourner le script, vérifier les données, basculer le code sur `profile_sports`.  
**À supprimer plus tard :** la colonne `profiles.sports`.

### 7.2 Si `profiles.id` doit être aligné avec `auth.users.id`

Souvent en Supabase on a `profiles.id = auth.users.id` (UUID) pour simplifier les RLS et les jointures.

**Cas 1 : `profiles.id` est déjà en UUID et rempli avec `auth.uid()`**  
Rien à faire côté schéma.

**Cas 2 : `profiles.id` est en BIGSERIAL (ou autre)**  
Ne pas renommer/supprimer `id` tout de suite.

| Étape | Action |
|-------|--------|
| A | Ajouter `auth_id UUID REFERENCES auth.users(id) UNIQUE` sur `profiles`. |
| B | Remplir `auth_id` pour les lignes existantes (lien signup → profil si tu as un trigger ou un enregistrement par user). |
| C | Adapter les RLS pour utiliser `auth_id = auth.uid()`. |
| D | Adapter le frontend et les services pour utiliser `auth_id` comme “mon profil”. |
| E | Plus tard : créer une nouvelle table `profiles_new` avec `id UUID PRIMARY KEY DEFAULT auth.uid()`, migrer les données, remplacer l’ancienne table et les FKs (profile_sports, etc.). |

Pour le MVP, **B** (ajouter `auth_id` + RLS sur `auth_id`) suffit sans toucher au type de `profiles.id`. La table `profile_sports` continue de référencer `profiles.id` (BIGINT ou UUID).

---

## 8. Récapitulatif : À faire maintenant / À migrer / À supprimer plus tard

### A. À faire maintenant

- Créer la table **sports** (avec index unique sur `slug`, index sur `name`).
- Créer la table **profile_sports** (FK vers `profiles` et `sports`, UNIQUE (profile_id, sport_id), index pour le feed).
- Si **profiles** existe déjà : ajouter uniquement les colonnes manquantes (sans supprimer aucune colonne).
- Activer RLS sur les 3 tables et créer les politiques décrites ci-dessus (en utilisant `auth_id` si `profiles.id` ≠ `auth.uid()`).
- Peupler **sports** avec le catalogue initial (noms + slugs).

### B. À migrer ensuite

- Si une colonne **sports** existe dans **profiles** : script de migration des données vers **profile_sports**, puis bascule du code sur **profile_sports**.
- Si **profiles.id** n’est pas `auth.uid()` : ajouter **auth_id**, le remplir, et baser les RLS sur **auth_id**.

### C. À supprimer plus tard

- Colonne **profiles.sports** (après migration validée et code basculé).
- Optionnel : migration complète de **profiles** vers `id = auth.users.id` (remplacement de table + FKs).

---

## 9. Recommandations d’architecture

1. **Sport = entité centrale** : toute la découverte et le matching s’appuient sur `sports` + `profile_sports`, pas sur un champ texte dans `profiles`.
2. **Feed** : requête basée sur “au moins un `sport_id` en commun” avec les index proposés.
3. **Catalogue sports** : maintenu côté base (table `sports`), pas en dur dans le frontend.
4. **Niveau (`level`)** : optionnel dans le MVP ; utile plus tard pour affiner le matching ou l’affichage.
5. **Pas de suppression brutale** : nouvelles tables et colonnes d’abord, migration des données, puis dépréciation/suppression des anciennes colonnes dans des étapes dédiées.

---

*Document d’architecture de données SPLove — Schéma, migration, RLS*
