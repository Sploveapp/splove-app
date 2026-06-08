# Audit drift Frontend ↔ Supabase

Généré pour stabiliser Discover, Auth, Likes, Messages, Notifications, Onboarding.

## A. Colonnes utilisées côté frontend mais absentes des migrations repo

| Table | Colonne | Statut | Action |
|-------|---------|--------|--------|
| `matches` | `conversation_id` | Absente (volontaire, voir `025`) | Frontend : lookup `conversations.match_id` (`matchConversationId.ts`, `likes.service.ts`) |
| `profiles` | `activity_photo_path` | Absente | Migration `109` + fallback tiers `profileSelect.ts` |
| `profiles` | `first_name`, `meet_pref`, `accepted_terms_at`, `photo_status`, `sport_feeling`, `updated_at`, `veriff_status`, `identity_verified`, `is_banned`, `deleted_at` | Partiel / live-only | Tiers select + merge optionnel |
| `feed_profiles_ranked` | (vue) | Absente | Migration `109` alias sur `feed_profiles` |

**Présentes en migrations :** `practice_preferences` (`064`), `subscriptions.profile_id` (`002`).

## B. RPC utilisées mais absentes des migrations (avant `109`)

| RPC | Fichiers | Action |
|-----|----------|--------|
| `get_discover_feed_alive` | `Discover.tsx`, `discoverFeedFetch.ts` | Migration `109` + fallback `feed_profiles` |
| `touch_profile_activity` | `Discover.tsx` | Optionnel (catch) — à ajouter si manquant en prod |

**Présentes :** `profile_distances_from_viewer` (`057`), `pulse_my_in_app_notifications` (`090`/`107`), `get_discover_rewind_status` (`077`/`078`), `discover_candidate_splove_ranking_flags` (`096`), `list_user_ids_blocked_with_me` (`035`).

## C. Tables / vues utilisées

| Objet | Statut |
|-------|--------|
| `feed_profiles` | OK (`010`–`070`) |
| `feed_profiles_ranked` | Ajout `109` |
| `messages` | OK (`053`+) — `CHAT_MESSAGES_TABLE = "messages"` |
| `referral_codes`, `referrals` | Migrations `076` |

## D. Colonnes SQL existantes peu / plus utilisées par le frontend

Exemples (non exhaustif) : colonnes modération legacy, `conversation_messages` (remplacé par `messages`), champs Veriff anciens si non lus dans les tiers actuels.

## Correctifs pipeline Discover

1. **Logs** : `[Discover pipeline]` via `discoverPipelineAudit.ts` (prod + dev) — avant/après chaque filtre + raison par profil exclu.
2. **Scoring** : le viewer passé au scoring omettait lat/lng/photos/sports → `viewer_incomplete` sur **tous** les candidats. Corrigé : champs viewer complets + contrôle une seule fois en tête de `scoreAndFilterDiscoverCandidates`.
3. **Feed** : RPC manquante → migration `109` + repli client `feed_profiles`.

## Filtres entre « after completeness » et « before scoring »

Ordre client (`Discover.tsx` `loadProfiles`) :

1. `sanity_valid_id_not_self` (id, GPS)
2. `exclude_outgoing_likes` (`likes.liker_id` / `liked_id`)
3. `exclude_blocks` (`list_user_ids_blocked_with_me`)
4. `exclude_matches` (`matches.user_a` / `user_b`)
5. `exclude_ghost_boost_slot` (localStorage ghost)
6. `discover_visibility_window` (prod uniquement)

Si `raw = 8` et `before scoring = 0`, consulter `[Discover pipeline] excluded` pour le `step` responsable.

## Déploiement SQL

```bash
supabase db push
# ou appliquer supabase/migrations/109_schema_drift_discover_feed.sql sur le projet lié
```
