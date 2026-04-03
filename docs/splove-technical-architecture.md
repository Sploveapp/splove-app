# SPLove — Architecture technique

**Version :** 1.0  
**Date :** Mars 2025  
**Statut :** Proposition pré-implémentation

---

## Objectifs

- Architecture **claire** et **maintenable**
- Fichiers **courts** et **réutilisables**
- Aucun composant **monolithique**
- **Séparation nette** entre UI, logique et data
- **Mobile-first**

---

## 1. Arborescence complète du projet

```
splove-app/
├── public/
│   └── favicon.ico
│
├── src/
│   ├── assets/                    # Images, icônes statiques
│   │   ├── images/
│   │   └── icons/
│   │
│   ├── components/                # Composants réutilisables
│   │   ├── ui/                    # Composants UI primitifs
│   │   ├── layout/                # Layout, navigation
│   │   ├── features/              # Composants métier par feature
│   │   └── forms/                 # Champs et formulaires réutilisables
│   │
│   ├── pages/                     # Pages = écrans de route
│   │   ├── onboarding/
│   │   ├── profile/
│   │   ├── discover/
│   │   ├── likes/
│   │   ├── matches/
│   │   ├── messages/
│   │   └── settings/
│   │
│   ├── hooks/                     # Hooks React custom
│   │   ├── api/                   # Hooks liés aux données
│   │   └── ui/                    # Hooks UI (swipe, modals…)
│   │
│   ├── lib/                       # Config, client Supabase
│   │   └── supabase.ts
│   │
│   ├── utils/                     # Fonctions utilitaires
│   │   ├── date.utils.ts
│   │   ├── validation.utils.ts
│   │   └── helpers.ts
│   │
│   ├── constants/                 # Constantes globales
│   │   ├── app.ts                 # APP_NAME, etc.
│   │   └── profile.ts             # MIN_AGE, MAX_AGE, etc.
│   │
│   ├── services/                  # Services Supabase / API
│   │   ├── auth.service.ts
│   │   ├── profiles.service.ts
│   │   ├── sports.service.ts
│   │   ├── likes.service.ts
│   │   ├── matches.service.ts
│   │   ├── messages.service.ts
│   │   └── storage.service.ts
│   │
│   ├── types/                     # Types TypeScript
│   │   ├── database.types.ts      # Types générés Supabase
│   │   ├── profile.types.ts
│   │   ├── sport.types.ts
│   │   ├── match.types.ts
│   │   ├── message.types.ts
│   │   └── index.ts
│   │
│   ├── routes/                    # Configuration des routes
│   │   ├── index.tsx
│   │   ├── ProtectedRoute.tsx
│   │   └── PublicRoute.tsx
│   │
│   ├── providers/                 # Providers React (auth, theme…)
│   │   ├── AuthProvider.tsx
│   │   └── AppProviders.tsx
│   │
│   ├── styles/                    # Styles globaux
│   │   └── globals.css
│   │
│   ├── App.tsx
│   └── main.tsx
│
├── docs/
│   ├── splove-prd.md
│   └── splove-technical-architecture.md
│
├── .env.example
├── .env.local                    # Non versionné
├── .gitignore
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

---

## 2. Rôle des dossiers principaux

| Dossier | Rôle | Exemple |
|---------|------|---------|
| **components/ui/** | Boutons, inputs, cards, badges, avatars — réutilisables partout | `Button`, `Avatar`, `Card` |
| **components/layout/** | Header, footer, bottom nav, container, page wrapper | `BottomNav`, `PageLayout` |
| **components/features/** | Composants métier liés à une feature | `ProfileCard`, `SwipeStack`, `ChatBubble` |
| **components/forms/** | Champs de formulaire, validation | `TextInput`, `DatePicker`, `SportSelector` |
| **pages/** | Un fichier par écran de route, orchestration uniquement | `DiscoverPage`, `ProfileEditPage` |
| **hooks/api/** | Récupération/cache des données (React Query + services) | `useProfile`, `useMatches` |
| **hooks/ui/** | Logique UI réutilisable | `useSwipe`, `useDebounce` |
| **lib/** | Config Supabase, client | `supabase.ts` |
| **utils/** | Fonctions utilitaires (dates, validation, helpers) | `date.utils`, `validation.utils` |
| **constants/** | Constantes globales | `APP_NAME`, `MIN_AGE`, `MAX_AGE` |
| **services/** | Appels Supabase (auth, DB, storage), pas de React | `profiles.service.ts` |
| **types/** | Interfaces et types TypeScript | `Profile`, `Match` |
| **routes/** | Définition des routes, guards (auth) | `ProtectedRoute` |
| **providers/** | Context providers globaux | `AuthProvider` |

---

## 3. Routes principales

### Arborescence des routes

```
/                           → Redirect selon auth
/login                     → Connexion (public)
/signup                    → Inscription (public)
/onboarding                → Complétion profil initial (protected)
/profile                   → Mon profil (protected)
/profile/edit              → Édition profil (protected)
/profile/sports            → Sélection sports (protected)
/discover                  → Découverte de profils (protected)
/likes                     → Likes reçus (protected)
/matches                   → Liste des matchs (protected)
/matches/:matchId/chat     → Conversation avec un match (protected)
/messages                  → Liste des conversations (protected)
/settings                  → Paramètres (protected)
```

### Routes publiques vs protégées

| Type | Routes | Comportement |
|------|--------|--------------|
| **Public** | `/login`, `/signup` | Si déjà connecté → redirect `/discover` |
| **Protected** | Tout le reste | Si non connecté → redirect `/login` |
| **Onboarding** | `/onboarding` | Si profil incomplet → redirect ici depuis les routes protégées |

### Fichier de définition des routes

```
src/routes/
├── index.tsx           # createBrowserRouter + route definitions
├── ProtectedRoute.tsx  # Guard : vérifie auth + profil complet
└── PublicRoute.tsx     # Guard : redirige si déjà connecté
```

---

## 4. Structure des composants

### Principes

- **UI** : présentation uniquement, reçoit des props
- **Features** : orchestrent UI + hooks, contiennent la logique métier
- **Pages** : assemblent layout + features, sans logique complexe

### Hiérarchie des composants

```
Page (DiscoverPage)
  └── Layout (PageLayout + BottomNav)
        └── Feature (DiscoverFeed)
              └── UI (ProfileCard, SwipeActions)
```

### Détail par dossier

#### `components/ui/`

| Composant | Responsabilité |
|-----------|----------------|
| `Button` | Bouton avec variants (primary, secondary, ghost) |
| `Avatar` | Photo de profil avec fallback |
| `Card` | Conteneur carte générique |
| `Badge` | Badge (sport, statut) |
| `Input` | Champ texte de base |
| `Modal` | Modal réutilisable |
| `Skeleton` | État de chargement |
| `Toast` | Notifications toast |

#### `components/layout/`

| Composant | Responsabilité |
|-----------|----------------|
| `PageLayout` | Structure commune des pages (padding, safe area) |
| `BottomNav` | Navigation bas (Discover, Likes, Matches, Profil) |
| `Header` | Header avec titre / actions |
| `SafeArea` | Zones sûres mobile (notch, etc.) |

#### `components/features/`

| Composant | Dossier | Responsabilité |
|-----------|---------|----------------|
| `ProfileCard` | discover/ | Carte profil dans le flux Discover |
| `SwipeStack` | discover/ | Pile de cartes avec swipe like/pass |
| `ProfilePreview` | shared/ | Mini aperçu profil (likes, matches) |
| `MatchCard` | matches/ | Carte d’un match |
| `ConversationList` | messages/ | Liste des conversations |
| `ChatThread` | messages/ | Fil de messages |
| `MessageInput` | messages/ | Zone de saisie + envoi |
| `PhotoUploader` | profile/ | Upload / ordre des photos |
| `SportSelector` | profile/ | Sélection multi-sports |

#### `components/forms/`

| Composant | Responsabilité |
|-----------|----------------|
| `TextInput` | Input texte avec label, erreur |
| `DatePicker` | Sélection date (naissance) |
| `Select` | Sélecteur (genre, orientation, type de rencontre) |
| `Textarea` | Bio |
| `FormField` | Wrapper label + erreur + champ |

---

## 5. Structure des services Supabase

### Organisation

Chaque service :
- utilise le client Supabase (singleton `lib/supabase.ts`)
- expose des fonctions **async** pures (pas de hooks)
- retourne des types typés
- gère les erreurs de manière cohérente

### Liste des services

| Fichier | Responsabilités |
|---------|-----------------|
| `auth.service.ts` | `signIn`, `signUp`, `signOut`, `resetPassword`, `getSession` |
| `profiles.service.ts` | `getProfile`, `updateProfile`, `getProfilesForDiscover`, `getProfileById` |
| `sports.service.ts` | `getSports`, `getProfileSports`, `setProfileSports` |
| `likes.service.ts` | `sendLike`, `getLikesReceived`, `hasMutualLike` |
| `matches.service.ts` | `getMatches`, `getMatchById`, `createMatchFromMutualLike` |
| `messages.service.ts` | `getConversations`, `getMessages`, `sendMessage`, `subscribeToMessages` |
| `storage.service.ts` | `uploadPhoto`, `deletePhoto`, `getPhotoUrl` |

### Exemple de signature

```typescript
// profiles.service.ts
export async function getProfile(userId: string): Promise<Profile | null>
export async function updateProfile(userId: string, data: Partial<ProfileUpdate>): Promise<Profile>
export async function getProfilesForDiscover(userId: string, filters: DiscoverFilters): Promise<Profile[]>
```

### Règles d’accès (concept)

- **RLS** : chaque service suppose des politiques RLS correctes
- **Storage** : bucket privé, URLs signées ou policies par utilisateur

---

## 6. Gestion de l’authentification

### Flux

1. **Supabase Auth** : gère sessions, tokens, refresh
2. **AuthProvider** : expose `user`, `session`, `loading`, `signIn`, `signOut`
3. **ProtectedRoute** : vérifie `user` avant d’afficher la route
4. **Onboarding guard** : vérifie si le profil est complet

### AuthProvider

```
src/providers/AuthProvider.tsx
```

- Écoute `onAuthStateChange` de Supabase
- Expose via `useAuth()` : `{ user, session, isLoading, signIn, signOut, signUp }`
- Pas de logique métier de profil (profil = profiles.service)

### Vérification du profil

- Après auth, lecture de `profiles` pour l’`user.id`
- Si aucun profil ou profil incomplet → redirect `/onboarding`
- Profil complet = au moins : prénom, date de naissance, genre, orientation, type de rencontre, 2 photos, 1 sport

### Stockage

- Pas de state persistant côté client pour la session
- Supabase gère le stockage (localStorage par défaut)
- `getSession()` au chargement pour restaurer la session

---

## 7. Structure des types TypeScript

### Organisation

| Fichier | Contenu |
|---------|---------|
| `database.types.ts` | Types générés par Supabase CLI (`supabase gen types typescript`) |
| `profile.types.ts` | `Profile`, `ProfileCreate`, `ProfileUpdate`, `DiscoverFilters` |
| `sport.types.ts` | `Sport`, `ProfileSport` |
| `match.types.ts` | `Match`, `MatchWithProfile` |
| `message.types.ts` | `Message`, `Conversation`, `ConversationWithProfile` |
| `auth.types.ts` | `User`, `Session` (extensions si besoin) |
| `index.ts` | Re-exports pour `import { Profile } from '@/types'` |

### Exemples de types

```typescript
// profile.types.ts
interface Profile {
  id: string
  first_name: string
  birth_date: string
  gender: Gender
  orientation: Orientation
  meet_type: MeetType
  bio: string | null
  accessibility_needs: string | null
  age_min_preference: number
  age_max_preference: number
  created_at: string
  updated_at: string
}

type Gender = 'male' | 'female' | 'non_binary' | 'other'
type Orientation = 'heterosexual' | 'homosexual' | 'bisexual' | 'other'
type MeetType = 'friendship' | 'romantic'

interface DiscoverFilters {
  ageMin?: number
  ageMax?: number
  meetType?: MeetType
}
```

```typescript
// match.types.ts
interface Match {
  id: string
  user_id_1: string
  user_id_2: string
  conversation_id: string | null
  created_at: string
}

interface MatchWithProfile extends Match {
  other_profile: Profile
  can_send_first_message: boolean
}
```

---

## 8. Gestion de l’état global

### Stratégie

| Type d’état | Outil | Usage |
|-------------|-------|--------|
| **Auth** | AuthProvider (Context) | user, session, auth actions |
| **Server state** | TanStack Query (React Query) | Profils, matches, messages, likes |
| **UI locale** | useState / useReducer | Modals, formulaires, filtres |
| **Données partagées UI** | Zustand (optionnel) | Filtres discover, préférences UI persistées |

### Recommandation

- **React Query** pour tout ce qui vient de Supabase (profiles, likes, matches, messages)
- **AuthProvider** pour l’auth uniquement
- **Zustand** uniquement si besoin d’état client partagé (ex. filtres discover persistés en session)

### Hooks de données (React Query)

```
hooks/api/
├── useProfile.ts          # useProfile(userId), useUpdateProfile()
├── useDiscoverProfiles.ts # useDiscoverProfiles(filters)
├── useLikes.ts            # useLikesReceived()
├── useMatches.ts          # useMatches()
├── useConversation.ts     # useConversation(matchId)
├── useMessages.ts         # useMessages(conversationId)
└── useSports.ts           # useSports(), useProfileSports()
```

Chaque hook :
- Appelle le service correspondant
- Utilise `useQuery` ou `useMutation`
- Gère loading, error, cache
- Retourne des données typées

### État minimal recommandé

- Auth : Context
- Server data : React Query
- UI : state local

→ Zustand peut être introduit plus tard si nécessaire.

---

## 9. Design system & Tailwind

### Structure Tailwind

- `tailwind.config.js` : couleurs (#3743BB, accent framboise/rose), breakpoints, typo
- `globals.css` : variables CSS, base styles
- Classes utilitaires Tailwind dans les composants
- Pas de CSS-in-JS pour le MVP

### Tokens design

```javascript
// tailwind.config.js
colors: {
  primary: '#3743BB',
  accent: '#E91E63',      // framboise/rose
  // ...
}
```

### Breakpoints

- Mobile first : `sm`, `md`, `lg`
- L’app est pensée d’abord pour mobile

---

## 10. Récapitulatif des dépendances prévues

| Package | Usage |
|---------|-------|
| react, react-dom | UI |
| react-router-dom | Routing |
| @supabase/supabase-js | Auth, DB, Storage |
| @tanstack/react-query | Server state |
| tailwindcss | Styling |
| lucide-react (ou similar) | Icônes |
| date-fns | Dates (âge, format) |
| zustand | État global (optionnel) |

---

## 11. Convention de nommage

| Élément | Convention | Exemple |
|---------|------------|---------|
| Composants | PascalCase | `ProfileCard`, `BottomNav` |
| Fichiers composants | PascalCase ou kebab-case | `ProfileCard.tsx` |
| Hooks | use + PascalCase | `useProfile`, `useSwipe` |
| Services | camelCase, suffixe .service | `profiles.service.ts` |
| Types | PascalCase | `Profile`, `DiscoverFilters` |
| Constantes | UPPER_SNAKE_CASE | `MIN_AGE`, `MAX_PHOTOS` |
| Dossiers | kebab-case ou camelCase | `profile-edit`, `discover` |

---

## 12. Bonnes pratiques retenues

1. **Un fichier = une responsabilité** : pas de fichiers > 200–250 lignes
2. **Props typées** : interfaces explicites pour chaque composant
3. **Services purs** : pas de React dans les services
4. **Hooks pour la logique** : extraire la logique dans des hooks
5. **Pages légères** : composition de features + layout
6. **Paths alias** : `@/components`, `@/services`, `@/types`
7. **Variables d’environnement** : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
8. **Pas de secrets côté client** : uniquement la clé anon Supabase

---

*Document d’architecture SPLove — Proposition pré-implémentation*
