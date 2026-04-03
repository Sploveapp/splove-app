# SPLove+ — Architecture d’implémentation

**Version :** 1.0  
**Rôle :** Lead full-stack — implémentation premium

---

## 1. Analyse de l’architecture actuelle

- **App** : `App.tsx` rend uniquement `Discover` (pas de router).
- **Pages** : `Discover.tsx` (profiles, like, match, match state).
- **Data** : Supabase (`profiles`, `likes`, `matches`, `sports`, `profile_sports`), `CURRENT_USER_ID` en dur.
- **UI** : inline styles, header SPLove, cartes profils, boutons Pass/Like.
- **Pas de** : router, auth context, services dédiés, hooks partagés, composants UI réutilisables.

---

## 2. Fichiers à créer ou modifier

### 2.1 Créer (implémenté)

| Fichier | Rôle |
|---------|------|
| `supabase/migrations/002_splove_plus.sql` | Tables premium (subscriptions, profile_boosts, profile_verifications, activity_availability) |
| `src/types/premium.types.ts` | Types Subscription, Boost, Verification, ActivitySlot, LikeReceived, ProfileInLikesYou |
| `src/constants/premium.ts` | Plans, durées boost, textes paywall |
| `src/services/premium.service.ts` | hasPremiumAccess(), getActiveSubscription() |
| `src/services/likes.service.ts` | getLikesReceived() |
| `src/hooks/usePremium.ts` | Hook hasPlus, isLoading |
| `src/hooks/useLikesReceived.ts` | Hook liste des likes reçus + loading/error |
| `src/components/PaywallModal.tsx` | Modal upsell SPLove+ |
| `src/components/PremiumBadge.tsx` | Badge SPLove+ sur profil |
| `src/components/VerifiedBadge.tsx` | Badge vérifié (placeholder) |
| `src/components/BlurredProfileCard.tsx` | Carte profil floutée pour Likes You sans abo |
| `src/components/LikesYouProfileCard.tsx` | Carte profil débloquée (avec Pass/Like) |
| `src/pages/LikesYou.tsx` | Écran “Qui m’a liké” (flouté vs débloqué) |
| `src/components/AppLayout.tsx` | Layout commun (header + nav basse Discover / Likes You) |
| `src/App.tsx` | HashRouter + routes Discover, LikesYou, AppLayout |

### 2.2 Modifier

| Fichier | Modification |
|---------|--------------|
| `package.json` | Ajouter `react-router-dom` |
| `src/main.tsx` | Enrobage avec `BrowserRouter` si router utilisé |
| `src/pages/Discover.tsx` | Utiliser `AppLayout`, optionnellement `PremiumBadge` / filtres plus tard |

---

## 3. Stack et conventions

- **Router** : `react-router-dom` (HashRouter pour simplicité déploiement).
- **État premium** : hook `usePremium` (lecture depuis `subscriptions` ou cache local).
- **Likes reçus** : `useLikesReceived` → `likes.service` → Supabase `likes` où `to_user = currentUser`.
- **UI** : composants fonctionnels, états loading / empty / error systématiques.
- **Styles** : garder style inline cohérent avec l’existant (#3743BB, gris, bordures légères).

---

## 4. Parcours “Likes You”

1. Utilisateur ouvre l’onglet “Likes You”.
2. Chargement des likes reçus (profils qui ont liké).
3. **Sans SPLove+** : affichage en cartes floutées + CTA “Débloquer avec SPLove+” ouvrant `PaywallModal`.
4. **Avec SPLove+** : cartes normales, cliquables (détail ou like en retour).

---

## 5. Évolutions prévues (après MVP+)

- Filtres avancés (sport, distance, intention, activité récente) dans Discover.
- Passeport sportif (ville secondaire).
- Agenda sportif (créneaux) + `activity_availability`.
- Radar “disponibles maintenant”.
- Intégration paiement (Stripe) et écriture `subscriptions` réelle.

---

*Document architecture SPLove+*
