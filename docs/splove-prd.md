# SPLove — Product Requirements Document (PRD)

**Version :** 1.0  
**Date :** Mars 2025  
**Statut :** Draft

---

## 1. Vision produit

### Concept
SPLove est une application de rencontre sportive et sociale qui permet aux personnes de se rencontrer dans la vraie vie à travers leurs sports favoris. L'objectif n'est pas de discuter pendant des semaines mais de faciliter de vraies rencontres grâce au sport.

### Vision
**Quand tu matches, tu rencontres vraiment quelqu'un.**

### Positionnement
- Application de rencontre sportive
- Rencontres amicales ou amoureuses
- Expérience authentique et naturelle
- Moins de filtres, moins de fake, moins de ghost
- Le sport est le moteur de la connexion entre les personnes

### Principe central
**Le sport crée la connexion entre les personnes.**

---

## 2. Cible utilisateur

### Public principal
- Personnes hétérosexuelles
- Personnes homosexuelles
- Personnes à mobilité réduite ou avec besoins d'accessibilité
- Personnes qui veulent rencontrer quelqu'un autour d'une activité sportive

### Profil type
- Âge : adultes uniquement (18 ans minimum, pas de limite maximale)
- Intérêt : activités sportives et rencontres sociales
- Recherche : authenticité, rencontres concrètes (amicales ou amoureuses)

---

## 3. Problèmes résolus

| Problème | Solution SPLove |
|----------|-----------------|
| Rencontres virtuelles sans concrétisation | Le sport comme prétexte naturel pour se voir en vrai |
| Profils non authentiques, filtres excessifs | Politique anti-filtre, photos naturelles encouragées |
| Ghosting et déceptions | Profils vérifiés, photos réelles, moins de faux profils |
| Manque de points communs pour briser la glace | Le sport comme sujet de connexion immédiat |
| Applications non inclusives | Accessibilité pour personnes à mobilité réduite |
| Matches sans contexte | Sports en commun comme base du matching |

---

## 4. Proposition de valeur

**Pour les utilisateurs :**
- Rencontrer des personnes partageant les mêmes passions sportives
- Concrétiser les rencontres rapidement autour d'une activité
- Expérience authentique avec des profils réels
- Choix entre rencontres amicales et amoureuses
- Application inclusive et accessible

**Différenciation :**
- Sport comme moteur unique de la connexion
- Authenticité privilégiée (pas de filtres)
- Matching basé sur les sports en commun
- Double usage : amitié et amour

---

## 5. Fonctionnalités MVP

### 5.1 Authentification utilisateur
- Inscription (email ou social login)
- Connexion
- Déconnexion

### 5.2 Création de profil
- Prénom
- Date de naissance
- Genre
- Orientation
- Type de rencontre recherché (amicale / amoureuse)
- Sports favoris
- Bio courte
- **Optionnel :** besoins d'accessibilité, type d'activité sportive adapté

### 5.3 Sélection de sports
- Les utilisateurs choisissent leurs sports favoris
- Ces sports servent au matching
- Au moins un sport requis

### 5.4 Profil utilisateur
- Photos (minimum 2)
- Sports
- Bio
- Préférences

### 5.5 Discover (découverte)
- Voir des profils compatibles (basés sur les sports en commun)
- Liker ou passer
- Filtres par âge, préférences

### 5.6 Match
- Lorsqu'il y a like réciproque
- Création automatique d'un match

### 5.7 Likes reçus
- Voir qui nous a liké

### 5.8 Messagerie
- Conversations entre matchs
- Règles de premier message respectées (voir section Règles métier)

### 5.9 Upload de photos
- Stockage sécurisé (Supabase Storage)
- Photos naturelles encouragées
- Pas de filtres Snapchat / beauté artificielle

---

## 6. Fonctionnalités futures

### SPLove+ (version premium)
- Voir qui nous a liké
- Filtres avancés
- Boost de profil
- Visibilité améliorée
- Suggestions de rencontres sportives

> SPLove+ doit être mentionné comme fonctionnalité future mais n'est pas nécessaire pour utiliser le MVP.

### Autres évolutions possibles
- Événements sportifs communautaires
- Suggestions de lieux pour pratiquer ensemble
- Intégration calendrier pour planifier les sorties sportives
- Vérification de profil (badge)
- Géolocalisation pour trouver des partenaires à proximité

---

## 7. Parcours utilisateur

### Parcours principal
1. **Onboarding** → Inscription / Connexion
2. **Profil** → Création ou complétion du profil (infos, photos, sports)
3. **Discover** → Consultation des profils compatibles, like / pass
4. **Match** → Notification de match réciproque
5. **Messagerie** → Premier message (selon règles), échange
6. **Rencontre IRL** → Planification d'une activité sportive commune

### Parcours secondaires
- **Likes reçus** → Consulter qui nous a liké
- **Settings** → Gestion des préférences, accessibilité, paramètres
- **Modification profil** → Mise à jour des photos, bio, sports

---

## 8. Architecture des écrans

```
SPLove
├── Onboarding
│   ├── Connexion
│   ├── Inscription
│   └── Choix type de rencontre
│
├── Profil
│   ├── Création / édition profil
│   ├── Upload photos
│   ├── Sélection sports
│   └── Préférences accessibilité
│
├── Discover
│   ├── Flux de profils
│   ├── Détail profil (swipe / clic)
│   └── Filtres (âge, distance, etc.)
│
├── Likes
│   └── Liste des likes reçus
│
├── Matches
│   ├── Liste des matchs
│   └── Conversation (messagerie)
│
├── Messages
│   ├── Liste des conversations
│   └── Chat (conversation)
│
└── Settings
    ├── Préférences
    ├── Notifications
    ├── Accessibilité
    └── Déconnexion
```

---

## 9. Règles métier

### 9.1 Tranche d'âge
- **Âge minimum :** 18 ans
- **Âge maximum :** pas de limite (exemple : 99 ans)
- Le système doit permettre de filtrer les profils selon les préférences d'âge
- Les mineurs sont strictement interdits

### 9.2 Règles de match et de messagerie

| Type de match | Règle premier message |
|---------------|------------------------|
| **Amoureux femme + homme** | Seule la femme peut envoyer le premier message |
| **Amoureux femme + femme** | La personne qui effectue le 2ᵉ like (celle qui déclenche le match) peut envoyer le premier message |
| **Amoureux homme + homme** | La personne qui effectue le 2ᵉ like (celle qui déclenche le match) peut envoyer le premier message |
| **Amical** | Les deux personnes peuvent envoyer le premier message |

### 9.3 Photos
- **Minimum :** 2 photos
- **Obligatoires :** 1 photo portrait, 1 photo libre (sport ou lifestyle)
- **Interdit :** filtres type Snapchat, beauté artificielle
- **Encouragé :** photos naturelles et authentiques

### 9.4 Logique de matching (sports)

**Principe :** Le matching est basé en priorité sur les sports en commun.

- Au moins **un sport en commun** doit exister pour que deux profils soient considérés comme compatibles
- Les profils compatibles peuvent apparaître dans le Discover et potentiellement matcher
- **Exemple :**
  - Utilisateur A : skate, randonnée
  - Utilisateur B : skate, yoga
  - Sport en commun : skate → profils compatibles

Les sports sont un **facteur clé** dans l'algorithme de découverte.

### 9.5 Types de rencontres
1. **Rencontre amicale**
2. **Rencontre amoureuse**

---

## 10. Sécurité et modération

### 10.1 Contenu interdit
L'application interdit strictement :
- La prostitution
- Les propositions d'argent contre services
- Le contenu sexuel explicite
- Le harcèlement
- Les arnaques
- Les faux profils

### 10.2 Messages signalables
Les messages contenant :
- Demandes d'argent
- Promotion de services sexuels
- Spam

… doivent pouvoir être **signalés** et **modérés**.

### 10.3 Protection contre la sortie immédiate de l'application

**Objectif :** Les échanges doivent se faire prioritairement dans l'application.

- Les liens externes doivent être **limités** dans la messagerie
- La promotion d'autres réseaux sociaux doit être **découragée**
- Les tentatives de redirection rapide vers WhatsApp, Telegram, etc. peuvent être **détectées**

**Principe :** Les utilisateurs peuvent partager leurs coordonnées (téléphone, réseaux sociaux) s'ils le souhaitent **après avoir établi un échange réel**. Mais l'expérience principale doit rester dans l'application.

### 10.4 Authenticité des profils
- Profils naturels et authentiques encouragés
- Réduction des fake profiles
- Réduction du ghosting
- Filtres photo excessifs **découragés**

---

## 11. Schéma de données

### Tables principales

| Table | Description |
|-------|-------------|
| **profiles** | Profils utilisateurs (prénom, date de naissance, genre, orientation, type de rencontre, bio, préférences accessibilité) |
| **sports** | Catalogue des sports disponibles |
| **profile_sports** | Association utilisateur ↔ sports (relation many-to-many) |
| **likes** | Likes envoyés (qui a liké qui) |
| **matches** | Matchs créés lors de like réciproque |
| **conversations** | Conversations entre matchs |
| **messages** | Messages dans les conversations |
| **photos** | Photos des profils (stockage des références) |

### Relations principales
- `profiles` ↔ `profile_sports` ↔ `sports`
- `profiles` → `likes` (émetteur / destinataire)
- `likes` réciproques → `matches`
- `matches` → `conversations`
- `conversations` → `messages`

---

## 12. Contraintes techniques

### Stack technique
- **Frontend :** React, TypeScript, Vite
- **Styling :** Tailwind CSS
- **Backend / Services :** Supabase
  - Authentification
  - Base de données (PostgreSQL)
  - Stockage (photos)

### Structure de l'application
- onboarding
- profil
- discover
- likes
- matches
- messages
- settings

### Principes techniques
- Mobile first
- Application responsive
- Stockage sécurisé des photos
- Respect RGPD et confidentialité

---

## 13. Principes UX

### Design
- **Moderne** — Interface actuelle et épurée
- **Simple** — Pas de fonctionnalités superflues
- **Premium** — Qualité visuelle soignée
- **Mobile first** — Optimisé pour smartphone

### Couleurs
- **Bleu principal :** #3743BB
- **Accent :** framboise / rose

### Expérience utilisateur
- **Rapide** — Actions fluides, peu de friction
- **Claire** — Navigation intuitive
- **Intuitive** — Parcours évidents
- **Centrée sur l'authenticité et le sport** — Le sport et le réel sont au cœur de l'expérience

### Accessibilité
- SPLove doit être inclusive pour les personnes à mobilité réduite
- Les utilisateurs peuvent indiquer :
  - S'ils ont des besoins spécifiques
  - Le type d'activité sportive adapté
  - Des préférences d'accessibilité pour les rencontres

---

## 14. Modèle économique

### MVP
- Application **gratuite** pour l'essentiel des fonctionnalités
- Pas de paywall bloquant pour le MVP

### Futur : SPLove+
- Version premium prévue
- Fonctions possibles (à définir plus tard) :
  - Voir qui nous a liké
  - Filtres avancés
  - Boost de profil
  - Visibilité améliorée
  - Suggestions de rencontres sportives

SPLove+ n'est **pas nécessaire** pour utiliser le MVP et sera développé ultérieurement.

---

*Document PRD SPLove — Tous droits réservés*
