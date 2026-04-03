# SPLove — Intégration Veriff (vérification photo)

## Flow : du clic au badge

1. **Utilisateur** va sur **Profil** (nav) et clique sur **« Vérifier mon profil »**.
2. **Frontend** envoie une requête POST à l’Edge Function `create-veriff-session` avec le **Bearer token** Supabase (session utilisateur).
3. **Edge Function** :
   - Vérifie le token et récupère `user.id` ( = `profile_id`).
   - Appelle l’API Veriff `POST /v1/sessions/` avec `X-AUTH-CLIENT` = clé API, et `verification.vendorData` / `verification.endUserId` = `profile_id`.
   - Reçoit `verification.id` (session ID) et `verification.url`.
   - Met à jour `profiles` : `photo_verification_session_id`, `photo_verification_status = 'pending'`, `photo_verification_provider = 'veriff'`.
   - Retourne `{ url }` au frontend.
4. **Frontend** ouvre `url` dans un nouvel onglet (flux Veriff).
5. **Utilisateur** termine la vérification côté Veriff.
6. **Veriff** envoie une requête POST au **webhook** (Edge Function `veriff-webhook`) avec le payload décision (approved / declined / review, etc.).
7. **Webhook** :
   - Valide `x-hmac-signature` avec la clé partagée Veriff.
   - Lit `verification.id` et `verification.status`.
   - Met à jour le profil dont `photo_verification_session_id` = `verification.id` : `is_photo_verified`, `photo_verification_status`, `photo_verification_updated_at`.
8. **Frontend** : au prochain chargement du profil (ou retour sur Profil), l’utilisateur voit « Profil vérifié » ou « Vérification en cours », etc. Le badge « Profil vérifié » s’affiche sur les cartes Discover et Qui m’a liké quand `is_photo_verified = true`.

---

## Variables d’environnement / secrets

### Edge Function `create-veriff-session`

À configurer dans **Supabase Dashboard > Edge Functions > create-veriff-session > Secrets** (ou via CLI) :

| Nom | Description | Exemple |
|-----|-------------|---------|
| `VERIFF_API_KEY` | Clé API Veriff (header `X-AUTH-CLIENT`) | Depuis Veriff Customer Portal > API keys |
| `VERIFF_BASE_URL` | URL de base de l’API Veriff | `https://stationapi.veriff.com` |

Les variables **SUPABASE_URL** et **SUPABASE_SERVICE_ROLE_KEY** sont fournies automatiquement par Supabase pour les Edge Functions.

### Edge Function `veriff-webhook`

| Nom | Description | Exemple |
|-----|-------------|---------|
| `VERIFF_SHARED_SECRET` | Clé partagée pour valider `x-hmac-signature` des webhooks | Depuis Veriff Customer Portal (shared secret) |

### Frontend (.env)

Aucune clé Veriff côté frontend. Seule `VITE_SUPABASE_URL` est utilisée pour appeler l’Edge Function (déjà utilisée pour le client Supabase).

---

## Configuration Veriff Customer Portal

1. **Webhook decision URL** : `https://<PROJECT_REF>.supabase.co/functions/v1/veriff-webhook`
2. S’assurer que la **Decision webhook** est activée pour l’intégration.

---

## Fichiers créés / modifiés

- **Migration** : `supabase/migrations/008_profiles_photo_verification.sql`
- **Edge Functions** : `supabase/functions/create-veriff-session/index.ts`, `supabase/functions/veriff-webhook/index.ts`
- **Frontend** : `src/pages/Profile.tsx`, `src/constants/copy.ts` (libellés Veriff), `src/App.tsx` (route `/profile`), `src/components/AppLayout.tsx` (lien Profil), `src/pages/Discover.tsx` et `src/components/LikesYouProfileCard.tsx` (badge), `src/types/premium.types.ts` et `src/services/likes.service.ts` (`is_photo_verified`).

---

## Déploiement des Edge Functions

```bash
supabase functions deploy create-veriff-session --no-verify-jwt
supabase functions deploy veriff-webhook --no-verify-jwt
```

Pour `create-veriff-session`, le JWT est vérifié manuellement (Bearer token utilisateur). Pour `veriff-webhook`, il n’y a pas de JWT (requête Veriff) ; ne pas utiliser `--no-verify-jwt` si tu configures une vérification côté Supabase (ex. vérification du path). En pratique, `veriff-webhook` doit accepter des requêtes sans JWT ; avec `--no-verify-jwt` les deux fonctions acceptent les requêtes non-JWT. Vérifier la doc Supabase pour le comportement par défaut (souvent les Edge Functions vérifient le JWT par défaut, ce qui bloquerait le webhook ; donc déployer le webhook avec l’option qui désactive la vérification JWT pour cette fonction).

Vérifier la doc Supabase à jour : [Edge Functions Auth](https://supabase.com/docs/guides/functions/auth). Pour le webhook, Veriff n’envoie pas de JWT Supabase, donc la fonction webhook doit être invocable sans JWT (option « no verify jwt » ou équivalent dans le dashboard).
