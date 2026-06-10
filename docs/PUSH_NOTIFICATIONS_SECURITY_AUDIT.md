# Audit sécurité — Notifications push SPLove

**Date :** 2026-05-28  
**Périmètre :** push natives (APNs / FCM), tokens, edge function, triggers SQL — **hors** messagerie in-app, navigation, auth, photos.

---

## 1. État actuel (avant / après audit)

### Architecture

| Composant | Rôle |
|-----------|------|
| `src/lib/pushNotifications.ts` | Permission, enregistrement Capacitor, routage au tap |
| `src/services/deviceTokens.service.ts` | Upsert token + présence en base |
| `supabase/migrations/111–113, 117` | Schéma `device_tokens`, dispatch SQL, séparation d’environnements |
| `supabase/functions/send-push-notification` | Envoi APNs + FCM, garde-fous, audit |
| Triggers SQL | Like, match, message → **un seul destinataire** par événement |

### Types d’envoi

| Type | Existe ? | Déclencheur |
|------|----------|-------------|
| Like / match / message | Oui | Triggers SQL automatiques |
| Broadcast / tous les utilisateurs | **Non** (bloqué côté edge) | — |
| Bouton « test push » dans l’app | **Non** | — |
| Script CLI de test | **Non** dans le repo | — |

### UI production

- **Notifications** (`/notifications`) : centre in-app + bouton **« Activer les notifications »** (permission OS légitime, pas d’envoi de test).
- Aucun écran admin d’envoi massif dans l’application.

---

## 2. Risques identifiés (état initial)

| Risque | Gravité | Description |
|--------|---------|-------------|
| Build dev → Supabase prod | **Critique** | Un build Xcode/Vite `local` pouvait écraser le token prod (`UNIQUE user_id, platform`) ; les événements staging/dev touchaient le même utilisateur. |
| APNs sandbox sur prod | **Élevée** | `APNS_PRODUCTION=false` sur un projet prod = échec silencieux ou mauvais hôte. |
| APNs prod sur build dev | **Élevée** | Clés production pouvant cibler des tokens sandbox. |
| Secret webhook unique | **Moyenne** | `PUSH_WEBHOOK_SECRET` : fuite = envoi arbitraire vers un `recipientUserId`. |
| Pas de journal d’audit | **Moyenne** | Impossible de tracer qui a reçu quoi et quand. |
| Pas de garde broadcast | **Moyenne** | Aucun broadcast aujourd’hui, mais aucune protection explicite pour l’avenir. |
| Tokens invalides non purgés | **Faible** | APNs 410 / FCM UNREGISTERED laissaient des lignes obsolètes. |
| `userId` mismatch upsert | **Faible** | Avertissement mais upsert quand même. |

---

## 3. Corrections effectuées

### 3.1 Séparation DEV / STAGING / PRODUCTION

**Migration `117_push_environment_security.sql`**

- Colonne `device_tokens.push_environment` : `development` \| `staging` \| `production`
- Contrainte unique `(user_id, platform, push_environment)` — un token dev ne remplace plus un token prod
- `push_webhook_settings.push_environment` aligné sur le projet Supabase
- Module client `src/lib/pushEnvironment.ts` : dérivation depuis `VITE_PUSH_ENV` ou `VITE_APP_ENV`

**Edge function**

- Secret obligatoire `SPLove_PUSH_ENV` (à configurer par projet Supabase)
- Filtre SQL : `.eq("push_environment", serverPushEnv)`
- Rejet `403` si `pushEnvironment` du corps ≠ environnement serveur

### 3.2 Clés Firebase / APNs isolées par environnement

| Garde | Comportement |
|-------|----------------|
| `SPLove_PUSH_ENV=production` + `APNS_PRODUCTION≠true` | **Envoi refusé** (`503 apns_sandbox_blocked_for_production_env`) |
| `SPLove_PUSH_ENV=development` + `APNS_PRODUCTION=true` | **Envoi refusé** (`503 apns_production_blocked_for_development_env`) |
| Tokens filtrés par `push_environment` | Un token enregistré en `development` n’est jamais ciblé par un serveur `production` |

**Recommandation opérationnelle :** un projet Supabase + un projet Firebase + un jeu de clés APNs **par environnement**.

### 3.3 Protection anti-broadcast accidentel

Dans `send-push-notification` :

- Rejet de `broadcast: true`, `recipientUserId: "all"` ou `"*"`
- Même avec `SPLove_ALLOW_BROADCAST=true`, un **`SPLove_BROADCAST_CONFIRM_SECRET`** et un **`adminUserId`** UUID sont requis
- Réponse `501 broadcast_not_implemented` — pas d’envoi global sans outil admin dédié

Les triggers SQL n’envoient qu’un UUID destinataire valide.

### 3.4 Confirmation obligatoire avant envoi global

Mécanisme prévu pour un futur outil staff uniquement :

```
SPLove_ALLOW_BROADCAST=true
SPLove_BROADCAST_CONFIRM_SECRET=<secret fort, hors repo>
adminConfirmationCode=<identique au secret>
adminUserId=<UUID admin>
```

Tant qu’aucun endpoint broadcast n’est implémenté, **aucun envoi global n’est possible**.

### 3.5 Journal d’audit complet

Table `push_send_audit_log` :

| Champ | Contenu |
|-------|---------|
| `created_at` | Date / heure UTC |
| `title`, `body`, `kind`, `route` | Contenu de la notification |
| `recipient_user_id` | Destinataire |
| `recipient_count`, `sent_count`, `skipped_count` | Volumétrie |
| `admin_user_id` | Admin (broadcast futur) |
| `push_environment` | Environnement |
| `trigger_source` | `sql_trigger` / `edge_function` / … |
| `payload`, `errors` | JSON détaillé |

RLS activée, **aucune policy client** — lecture via SQL staff / service role uniquement.

### 3.6 Builds development : pas d’enregistrement token par défaut

- `isPushRegistrationAllowed()` : `false` en `development` sauf `VITE_PUSH_REGISTRATION_IN_DEV=true`
- Bloque l’upsert si `session.user.id ≠ userId`
- Logs push client silencieux en build `production` (hors `import.meta.env.DEV`)

### 3.7 Autres durcissements

- Validation UUID stricte pour `recipientUserId`
- Suppression automatique des tokens APNs/FCM invalides (410 / UNREGISTERED)
- Logs edge verbeux limités hors production (`SPLove_PUSH_VERBOSE_LOGS` pour debug)

---

## 4. Vérification point 6 — Absence d’outils de test en production

| Élément | Présent en prod ? |
|---------|-------------------|
| Bouton « envoyer notification test » | **Non** |
| Script npm `test-push` | **Non** |
| Route admin broadcast | **Non** |
| `VITE_PUSH_REGISTRATION_IN_DEV` | **Non** en build App Store (`VITE_APP_ENV=production`) |
| Panneau debug OAuth (`AuthCallback`) | Uniquement `import.meta.env.DEV` — **absent** du build prod |
| Bouton « Activer les notifications » | **Oui** — fonctionnalité produit (permission OS), pas un envoi de test |

---

## 5. Configuration requise par environnement

### Projet PRODUCTION

```bash
# Edge secrets
SPLove_PUSH_ENV=production
APNS_PRODUCTION=true
PUSH_WEBHOOK_SECRET=<secret fort>
# SPLove_ALLOW_BROADCAST=false  (défaut)

# Build iOS/Android
VITE_APP_ENV=production
# VITE_PUSH_ENV=production  (optionnel)
```

```sql
UPDATE public.push_webhook_settings
SET functions_base_url = 'https://<prod>.supabase.co',
    webhook_secret = '<identique à PUSH_WEBHOOK_SECRET>',
    push_environment = 'production';
```

### Projet STAGING

```bash
SPLove_PUSH_ENV=staging
APNS_PRODUCTION=false   # ou true si build TestFlight staging
VITE_APP_ENV=staging
```

### Développement local

```bash
SPLove_PUSH_ENV=development
APNS_PRODUCTION=false
VITE_APP_ENV=local
# Ne pas pointer VITE_SUPABASE_URL vers la prod
# VITE_PUSH_REGISTRATION_IN_DEV=true  # seulement pour tests manuels sur projet dev
```

---

## 6. Requêtes de contrôle (staff)

```sql
-- Derniers envois push
SELECT created_at, push_environment, kind, title, recipient_user_id,
       recipient_count, sent_count, skipped_count, trigger_source, admin_user_id
FROM public.push_send_audit_log
ORDER BY created_at DESC
LIMIT 50;

-- Tokens par environnement
SELECT push_environment, platform, count(*) 
FROM public.device_tokens 
GROUP BY 1, 2;

-- Alignement webhook / edge
SELECT push_environment, left(functions_base_url, 40) AS base_url
FROM public.push_webhook_settings;
```

---

## 7. Recommandations restantes

| Priorité | Action |
|----------|--------|
| **Haute** | Appliquer la migration `117` sur tous les projets Supabase |
| **Haute** | Définir `SPLove_PUSH_ENV` sur chaque déploiement edge |
| **Haute** | Projets Supabase **séparés** dev / staging / prod (ne jamais partager l’URL prod en dev) |
| **Moyenne** | Dashboard staff pour consulter `push_send_audit_log` |
| **Moyenne** | Rate limiting par `recipient_user_id` sur l’edge function |
| **Moyenne** | Retirer `webhook_secret` de `push_webhook_settings` (secret edge uniquement + Vault) |
| **Moyenne** | CI : échouer si `VITE_APP_ENV=production` et URL Supabase ≠ projet prod attendu |
| **Basse** | Versionner `verify_jwt = false` pour `send-push-notification` dans `config.toml` |
| **Basse** | Alerte si `sent_count = 0` et `recipient_count > 0` de façon répétée |

---

## 8. Fichiers modifiés (cet audit)

| Fichier | Changement |
|---------|------------|
| `supabase/migrations/117_push_environment_security.sql` | Environnements, audit log, dispatch |
| `supabase/functions/send-push-notification/index.ts` | Gardes, audit, purge tokens |
| `src/lib/pushEnvironment.ts` | Résolution env client |
| `src/lib/pushNotifications.ts` | Blocage enregistrement dev, logs |
| `src/services/deviceTokens.service.ts` | `push_environment`, blocage mismatch |
| `.env.example` | Documentation secrets / variables |
| `docs/PUSH_NOTIFICATIONS_SECURITY_AUDIT.md` | Ce rapport |

---

## 9. Synthèse

**Avant :** push fonctionnel like/match/message, mais sans séparation d’environnement ni audit ; risque réel qu’un build de test enregistre un token sur la base prod.

**Après :** tokens et envois scopés par `push_environment`, garde APNs prod/sandbox, broadcast explicitement bloqué, journal d’audit serveur, enregistrement dev désactivé par défaut.

**Aucune notification de test ne peut être envoyée aux utilisateurs prod** tant que :
1. Le projet Supabase prod a `SPLove_PUSH_ENV=production`
2. Les builds App Store ont `VITE_APP_ENV=production`
3. Les builds dev ne peuvent pas enregistrer de token prod sans opt-in explicite
4. Aucun outil broadcast n’est activé (`SPLove_ALLOW_BROADCAST` reste `false`)
