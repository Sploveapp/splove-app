# SPLove — Spots sportifs (V2)

**Version :** 1.0  
**Statut :** Base produit / data préparée pour future V2  
**Date :** Mars 2025

---

## 1. Positionnement

**SPLove n’est pas :**
- une app pour compléter une équipe
- une app pour trouver un joueur manquant
- une app de mise en relation sportive orientée organisation de parties

**SPLove est :**
- une app de **rencontre amoureuse ou amicale**
- **grâce au sport**
- dans un **contexte réel**

Les spots sportifs servent à proposer des lieux où pratiquer ensemble, dans un cadre rencontre, pas organisation de match.

---

## 2. Structure produit (V2)

### 2.1 Données d’un spot

| Champ | Type | Description |
|-------|------|-------------|
| **nom** | string | Nom du spot (ex. "Skatepark de la Villette") |
| **ville** | string | Ville du spot |
| **sport_principal** | FK → sports | Sport principal pratiqué |
| **ambiance** | enum/option | Type d’ambiance (décontracté, intense, mixte…) |
| **moment_prefere** | enum/option | Moment préféré (matin, après-midi, soir, week-end) |
| **profils_liés** | relation | Profils qui aiment / fréquentent ce spot |

### 2.2 Indicateurs affichés (UI)

- **"X personnes aiment ce spot"** — nombre de profils ayant liké / ajouté ce spot
- **"X personnes dispo ce week-end"** — profils ayant indiqué disponibilité (future feature)
- **"X profil(s) compatible(s)"** — profils avec au moins un sport en commun + intérêt pour le spot

### 2.3 Options ambiance (exemple)

- décontracté  
- intense  
- mixte  
- familial  
- entre amis  

### 2.4 Options moment préféré (exemple)

- matin  
- après-midi  
- soir  
- week-end  

---

## 3. Schéma de données (SQL pour V2)

```sql
-- Table spots (à créer en V2)
CREATE TABLE IF NOT EXISTS public.spots (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  city          TEXT NOT NULL,
  sport_id      BIGINT NOT NULL REFERENCES public.sports(id),
  ambiance      TEXT,
  moment_prefere TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table profile_spots (liaison profil ↔ spot : "j'aime ce spot")
CREATE TABLE IF NOT EXISTS public.profile_spots (
  id         BIGSERIAL PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  spot_id    BIGINT NOT NULL REFERENCES public.spots(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, spot_id)
);

CREATE INDEX idx_spots_city ON public.spots (city);
CREATE INDEX idx_spots_sport_id ON public.spots (sport_id);
CREATE INDEX idx_profile_spots_profile_id ON public.profile_spots (profile_id);
CREATE INDEX idx_profile_spots_spot_id ON public.profile_spots (spot_id);
```

---

## 4. Principes UI (V2)

- **Pas de carte interactive** dans la V2 initiale : liste de spots par ville ou par sport
- Cartes simples : nom, ville, sport, ambiance, indicateurs
- Lien vers les profils compatibles / qui aiment le spot
- Design cohérent avec Discover (SPLove premium, sobre)

---

## 5. Fichiers préparés dans le projet

- **`src/constants/index.ts`** : `SPOT_AMBIANCE_OPTIONS`, `SPOT_MOMENT_OPTIONS`
- **`src/types/index.ts`** : type `Spot`, `SpotWithIndicators`

---

*Document Spots sportifs — base pour future V2*
