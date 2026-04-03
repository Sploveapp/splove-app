# SPLove+ — Architecture backend / Supabase

**Version :** 1.0  
**Contexte :** SPLove = rencontre par le sport. SPLove+ = offre premium.  
**Objectif :** Schéma simple, solide, maintenable et sécurisé (RLS), compatible MVP évolutif.

---

## 1. Vue d’ensemble des tables

| Table | Rôle |
|-------|------|
| **profiles** | Utilisateurs (existant). Colonnes ajoutées pour SPLove+ : `passport_city`, `available_now_until`. |
| **likes** | Likes envoyés (from_user → to_user). Base pour « Qui m’a liké » et matching. |
| **subscriptions** | Abonnements SPLove+ (un abonnement actif par profil à la fois). |
| **profile_boosts** | Boosts de visibilité (créneaux de 30 min). Achats ponctuels. |
| **profile_verifications** | Statut de vérification du profil (badge vérifié). Une ligne par profil. |
| **activity_availability** | Agenda sportif : créneaux habituels par jour/heure. |

**Prérequis :** tables `profiles` (id UUID), `sports`, `profile_sports` (migration 001).  
**Convention :** `profiles.id = auth.uid()` (un profil par compte authentifié).

---

## 2. Tables et colonnes détaillées

### 2.1 `profiles` (colonnes SPLove+)

Colonnes **ajoutées** pour le premium (reste du schéma inchangé) :

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `passport_city` | TEXT | nullable | Ville de découverte (passeport sportif). |
| `available_now_until` | TIMESTAMPTZ | nullable | Fin de la plage « dispo maintenant » (radar). |

**Accès premium :** dérivé côté app via `subscriptions` (abonnement actif) et `profile_boosts` (boost actif).  
**Badge premium :** affiché si abonnement actif (pas de colonne dédiée).

---

### 2.2 `likes`

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | UUID | PK, default gen_random_uuid() | Identifiant du like. |
| `from_user` | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE | Qui like. |
| `to_user` | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE | Qui est liké. |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | Date du like. |

**Contrainte d’unicité :** `UNIQUE (from_user, to_user)` — un like par paire (from, to).  
**Règle métier :** pas de like de soi-même (from_user ≠ to_user) — à garantir en app ou par CHECK.

---

### 2.3 `subscriptions`

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | UUID | PK, default gen_random_uuid() | Identifiant. |
| `profile_id` | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE | Profil abonné. |
| `plan` | TEXT | NOT NULL, default 'plus' | Plan (pour l’instant uniquement `plus`). |
| `status` | TEXT | NOT NULL, default 'active' | active \| canceled \| expired \| past_due. |
| `started_at` | TIMESTAMPTZ | NOT NULL, default NOW() | Début de la période. |
| `ends_at` | TIMESTAMPTZ | nullable | Fin de la période (renouvellement ou expiration). |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | Création. |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default NOW() | Dernière mise à jour. |
| *(évolution)* `external_id` | TEXT | nullable | ID abonnement côté fournisseur (ex. Stripe). |
| *(évolution)* `provider` | TEXT | nullable | Ex. 'stripe'. |

**Contrainte :** au plus un abonnement actif par profil (index unique partiel `WHERE status = 'active'`).  
**CHECK (optionnel) :** `plan IN ('plus')`, `status IN ('active','canceled','expired','past_due')`.

---

### 2.4 `profile_boosts`

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | BIGSERIAL | PK | Identifiant. |
| `profile_id` | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE | Profil boosté. |
| `starts_at` | TIMESTAMPTZ | NOT NULL, default NOW() | Début du boost. |
| `ends_at` | TIMESTAMPTZ | NOT NULL | Fin du boost (ex. starts_at + 30 min). |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | Création. |

**CHECK :** `ends_at > starts_at`.  
**Création :** par le backend (Edge Function / webhook) après achat, pas par l’utilisateur directement.

---

### 2.5 `profile_verifications`

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | BIGSERIAL | PK | Identifiant. |
| `profile_id` | UUID | NOT NULL, FK → profiles(id), UNIQUE | Un enregistrement par profil. |
| `status` | TEXT | NOT NULL, default 'pending' | pending \| verified \| rejected. |
| `verified_at` | TIMESTAMPTZ | nullable | Date de vérification. |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | Création. |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default NOW() | Dernière mise à jour. |

**CHECK :** `status IN ('pending','verified','rejected')`.  
**Écriture :** réservée au backend / modération (pas d’INSERT/UPDATE par l’utilisateur).

---

### 2.6 `activity_availability`

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | BIGSERIAL | PK | Identifiant. |
| `profile_id` | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE | Propriétaire du créneau. |
| `day_of_week` | SMALLINT | NOT NULL | 0 = dimanche … 6 = samedi. |
| `start_time` | TIME | nullable | Heure de début. |
| `end_time` | TIME | nullable | Heure de fin. |
| `label` | TEXT | nullable | Libellé optionnel (ex. « Mardi 18h »). |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | Création. |

**Unicité :** `UNIQUE (profile_id, day_of_week, start_time)` pour éviter doublons.  
**CHECK (optionnel) :** `day_of_week BETWEEN 0 AND 6`, `end_time IS NULL OR end_time > start_time`.

---

## 3. Relations entre tables

```
profiles (id)
  ├── likes (from_user, to_user)
  ├── subscriptions (profile_id)
  ├── profile_boosts (profile_id)
  ├── profile_verifications (profile_id) [0..1]
  └── activity_availability (profile_id)
```

- **Likes reçus :** `likes.to_user = current_user_id`.  
- **Abonnement actif :** `subscriptions.profile_id = X AND status = 'active' AND (ends_at IS NULL OR ends_at > NOW())`.  
- **Boost actif :** `profile_boosts.profile_id = X AND ends_at > NOW()`.  
- **Badge premium :** dérivé de l’abonnement actif (pas de table dédiée).  
- **Badge vérifié :** `profile_verifications.profile_id = X AND status = 'verified'`.  
- **Radar « dispo maintenant » :** `profiles.available_now_until > NOW()`.  
- **Passeport ville :** `profiles.passport_city IS NOT NULL`.

---

## 4. Contraintes importantes

| Contrainte | Table | Détail |
|------------|--------|--------|
| Unicité like | likes | `UNIQUE (from_user, to_user)` |
| Un like pas vers soi | likes | `CHECK (from_user != to_user)` (optionnel) |
| Un abonnement actif par profil | subscriptions | Index unique partiel `(profile_id) WHERE status = 'active'` |
| Statut abonnement | subscriptions | `CHECK (status IN (...))` (optionnel) |
| Plan | subscriptions | `CHECK (plan = 'plus')` (optionnel) |
| Durée boost | profile_boosts | `CHECK (ends_at > starts_at)` |
| Un enregistrement par profil | profile_verifications | `UNIQUE (profile_id)` |
| Statut vérification | profile_verifications | `CHECK (status IN (...))` (optionnel) |
| Créneaux agenda | activity_availability | `UNIQUE (profile_id, day_of_week, start_time)` |

---

## 5. Index utiles

| Index | Table | Usage |
|-------|--------|--------|
| `likes_to_user_created` | likes | Liste « qui m’a liké » : `WHERE to_user = ? ORDER BY created_at DESC` |
| `likes_from_user` | likes | Éviter doublon like + vérif match |
| `idx_subscriptions_profile_active` | subscriptions | Un seul actif par profil (déjà en UNIQUE partiel) |
| `idx_subscriptions_ends_at` | subscriptions | Jobs d’expiration (WHERE ends_at IS NOT NULL AND ends_at < NOW()) |
| `idx_profile_boosts_profile` | profile_boosts | Boosts d’un profil |
| `idx_profile_boosts_ends_at` | profile_boosts | Boosts actifs (WHERE ends_at > NOW()) |
| `idx_profile_verifications_status` | profile_verifications | Filtre par statut |
| `idx_activity_availability_profile` | activity_availability | Créneaux d’un profil |
| `idx_profiles_available_now` | profiles | Radar : `WHERE available_now_until IS NOT NULL AND available_now_until > NOW()` |

---

## 6. Politiques RLS pertinentes

### 6.1 `likes`

- **SELECT :** l’utilisateur voit les likes où il est `from_user` ou `to_user`.  
- **INSERT :** uniquement avec `from_user = auth.uid()`.  
- **DELETE :** uniquement son propre like (`from_user = auth.uid()`).  
- Pas d’UPDATE (un like ne se modifie pas).

### 6.2 `subscriptions`

- **SELECT :** uniquement ses propres lignes (`profile_id = auth.uid()`).  
- **INSERT / UPDATE / DELETE :** aucune policy pour `authenticated` — réservé au backend (Stripe webhook via `service_role`).

### 6.3 `profile_boosts`

- **SELECT :** uniquement ses propres lignes (`profile_id = auth.uid()`).  
- **INSERT / UPDATE / DELETE :** réservé au backend (après achat).

### 6.4 `profile_verifications`

- **SELECT :** tout le monde (authentifié) peut voir le statut (pour afficher le badge).  
- **INSERT / UPDATE / DELETE :** réservé au backend / modération.

### 6.5 `activity_availability`

- **SELECT :** tout le monde (pour afficher compatibilités avec les matchs).  
- **INSERT / UPDATE / DELETE :** uniquement ses propres lignes (`profile_id = auth.uid()`).

### 6.6 `profiles`

- Les colonnes `passport_city` et `available_now_until` suivent les politiques existantes de `profiles` (lecture large pour le feed, mise à jour uniquement sur son propre profil).

---

## 7. Migrations SQL

- **001** : `sports`, `profile_sports` (existant).  
- **002** : `subscriptions`, `profile_boosts`, `profile_verifications`, `activity_availability`, colonnes `profiles` (passport_city, available_now_until).  
- **003** : création de `likes` si elle n’existe pas (avec RLS et index), contraintes CHECK sur subscriptions / profile_boosts / profile_verifications, colonnes d’évolution (`external_id`, `provider` sur `subscriptions`), index `profiles.available_now_until`.

Les migrations sont **additives** (pas de suppression de colonnes ni de tables dans 003).  
**Si la table `likes` existe déjà** sans `UNIQUE(from_user, to_user)` ou `CHECK(from_user != to_user)`, ajouter ces contraintes manuellement après vérification des données, ou adapter 003 pour ne pas recréer la table et uniquement ajouter les contraintes manquantes.

---

## 8. Champs pour l’évolution future

| Où | Champ / idée | Usage possible |
|----|----------------|------------------|
| subscriptions | `external_id`, `provider` | Réconciliation Stripe, annulation, renouvellement. |
| subscriptions | `cancel_at_period_end` (boolean) | Ne pas renouveler à la fin de la période. |
| subscriptions | `metadata` (JSONB) | Données libres (promo, canal, etc.). |
| profile_boosts | `source` (TEXT) ou `purchase_id` (UUID) | Lien vers un achat / pack pour analytics. |
| profile_boosts | Durée variable | Plusieurs durées (15 min, 1 h) selon produit. |
| profiles | `preferences_visibility` (JSONB) | Préférences d’affichage avancées. |
| — | Table `purchases` ou `transactions` | Centraliser tous les achats (abos + boosts) pour facturation et analytics. |
| profile_verifications | `verified_by` (UUID), `rejection_reason` (TEXT) | Audit et modération. |

---

## 9. Récapitulatif fonctionnalités → données

| Fonctionnalité | Données |
|----------------|---------|
| Abonnement SPLove+ | `subscriptions` (status = active, ends_at) |
| Achats de boosts | `profile_boosts` (créés par le backend après paiement) |
| Accès aux features premium | Dérivé de `subscriptions` + règles métier (ex. likes_you, filtres, passeport, agenda, radar, badge) |
| Likes reçus | `likes` où `to_user = current_user_id` |
| Disponibilité sportive (radar) | `profiles.available_now_until` |
| Passeport ville | `profiles.passport_city` |
| Badge premium | Abonnement actif (pas de colonne dédiée) |
| Statut de vérification profil | `profile_verifications.status` |
| Agenda sportif | `activity_availability` |

---

*Document d’architecture backend SPLove+ — Supabase, MVP évolutif.*
