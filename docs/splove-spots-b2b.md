# SPLove — Spots B2B (réflexion produit / technique)

**Version :** 1.0  
**Statut :** Réflexion préparation future  
**Date :** Mars 2025

---

## 1. Principe

Le B2B SPLove est **additif** : il ne modifie pas la logique cœur (rencontre par le sport). Les partenaires (salles, clubs, terrains) deviennent des **spots valorisés** dans l’app, avec des options de visibilité et de promotion.

**Logique inchangée :** les utilisateurs découvrent des profils, matchent, proposent une activité. Les spots B2B sont des **lieux suggérés** pour cette activité.

---

## 2. Partenaires potentiels

| Type | Exemples |
|------|----------|
| Salles de sport | Gymnases, fitness |
| Salles d'escalade | Bloc, mur |
| Clubs | Tennis, rugby, natation |
| Terrains | Football, basket, padel |
| Skateparks | Indoor, outdoor |
| Salles de padel | Courts dédiés |

---

## 3. Offres B2B (conceptuelles)

### 3.1 Spots sponsorisés
- Mise en avant dans la liste des spots (ordre prioritaire, badge "Partenaire")
- Apparition dans les suggestions "Où pratiquer ?" après un match

### 3.2 Spots recommandés
- Badge "Recommandé par SPLove" ou "Partenaire vérifié"
- Critères : partenariat actif, qualité du lieu, pertinence sport

### 3.3 Visibilité partenaire
- Fiche partenaire enrichie (logo, description, photos, horaires)
- Lien vers le spot depuis les profils qui le fréquentent
- Section "Spots partenaires" dans l’app

### 3.4 Promotions liées aux rencontres SPLove
- Offres "Première séance à deux" (réduction pour un duo SPLove)
- Codes promo partagés après un match
- "Invite ton match" : tarif préférentiel pour une première visite ensemble

---

## 4. Structure de données (base légère)

Extension de la structure Spots existante, sans casser le modèle actuel.

### 4.1 Table `partners`
Lie un spot à un partenaire B2B (optionnel : un spot peut exister sans partenaire).

```sql
CREATE TABLE IF NOT EXISTS public.partners (
  id          BIGSERIAL PRIMARY KEY,
  spot_id     BIGINT NOT NULL REFERENCES public.spots(id) ON DELETE CASCADE UNIQUE,
  name        TEXT NOT NULL,
  logo_url    TEXT,
  description TEXT,
  website_url TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.2 Table `partner_plans`
Types d’offre souscrits par un partenaire (sponsorisé, recommandé, promotions).

```sql
CREATE TABLE IF NOT EXISTS public.partner_plans (
  id          BIGSERIAL PRIMARY KEY,
  partner_id  BIGINT NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  plan_type   TEXT NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- plan_type : 'sponsored' | 'recommended' | 'visibility' | 'promotions'
```

### 4.3 Table `partner_promotions`
Promotions ponctuelles (codes, offres "première séance à deux").

```sql
CREATE TABLE IF NOT EXISTS public.partner_promotions (
  id           BIGSERIAL PRIMARY KEY,
  partner_id   BIGINT NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  code         TEXT,
  valid_until  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.4 Extension de `spots`
Ajout optionnel d’un flag pour faciliter les requêtes.

```sql
ALTER TABLE public.spots ADD COLUMN IF NOT EXISTS is_partner BOOLEAN DEFAULT FALSE;
```

---

## 5. Intégration produit

| Fonctionnalité | Rôle du B2B |
|----------------|-------------|
| Liste des spots | Tri / priorité pour spots sponsorisés ou recommandés |
| Fiche spot | Contenu enrichi si partenaire (logo, description, promo) |
| Après un match | Suggestion "Où pratiquer ?" incluant les spots partenaires |
| Promotions | Affichage d’offres "Première séance à deux" sur les fiches partenaires |

---

## 6. Principes de conception

- **Léger** : pas de back-office B2B pour l’instant ; structure prête pour plus tard
- **Optionnel** : un spot reste utilisable sans partenaire
- **Transparent** : badge "Partenaire" pour distinguer les spots sponsorisés
- **Cœur intact** : la rencontre reste le moteur ; le B2B ne change pas le flux Discover → Match → Proposition d’activité

---

## 7. Fichiers associés

- **`docs/splove-spots-feature.md`** : structure Spots (prérequis)
- **`src/types/index.ts`** : types `Spot`, `SpotWithIndicators`, `Partner`, `PartnerPlanType`

---

*Document Spots B2B — réflexion pour future évolution*
