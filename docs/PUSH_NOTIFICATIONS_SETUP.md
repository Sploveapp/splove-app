# Push notifications natives — SPLove

Notifications système (bannière iOS / Android) pour **like**, **message** et **match**, via **APNs** et **FCM**.

## Architecture

| Couche | Rôle |
|--------|------|
| App Capacitor | Permission, token, présence (`active_route`), navigation au tap |
| `public.device_tokens` | Token APNs/FCM + présence |
| Triggers SQL (`likes`, `matches`, `messages`) | Appellent `splove_dispatch_push_notification` |
| Edge Function `send-push-notification` | Envoie APNs/FCM, ignore si utilisateur déjà sur l’écran |

## 1. Migrations Supabase

```bash
# Appliquer au minimum :
# 111_device_tokens.sql
# 113_push_notifications.sql
```

Configurer le webhook SQL (une fois par projet) :

```sql
UPDATE public.push_webhook_settings
SET
  functions_base_url = 'https://VOTRE_REF.supabase.co',
  webhook_secret = 'un-secret-long-aleatoire'
WHERE id = 1;
```

## 2. Edge Function — secrets

Déployer :

```bash
supabase functions deploy send-push-notification --no-verify-jwt
```

Secrets (Dashboard → Edge Functions → Secrets) :

| Secret | Description |
|--------|-------------|
| `PUSH_WEBHOOK_SECRET` | Même valeur que `push_webhook_settings.webhook_secret` |
| `APNS_KEY_ID` | Key ID Apple (.p8) |
| `APNS_TEAM_ID` | Team ID Apple |
| `APNS_PRIVATE_KEY` | Contenu du fichier `.p8` (PEM ou corps brut) |
| `APNS_BUNDLE_ID` | `com.splove.app` |
| `APNS_PRODUCTION` | `false` (sandbox) ou `true` (TestFlight / App Store) |
| `FCM_SERVICE_ACCOUNT_JSON` | JSON compte de service Firebase (Android) |

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement.

## 3. iOS (APNs)

Voir aussi [PUSH_NOTIFICATIONS_IOS_SETUP.md](./PUSH_NOTIFICATIONS_IOS_SETUP.md).

- Capabilities : **Push Notifications** + **Background Modes → Remote notifications**
- Appareil physique obligatoire pour tester
- `npm run build && npx cap sync ios`

## 4. Android (FCM)

1. Projet Firebase → ajouter l’app Android `com.splove.app`
2. Télécharger `google-services.json` → `android/app/google-services.json`
3. Compte de service Firebase → coller le JSON dans `FCM_SERVICE_ACCOUNT_JSON`
4. `npm run build && npx cap sync android`

Canal notification : `splove_default` (créé dans `MainActivity.java`).

## 5. Textes des notifications

| Type | Titre | Texte |
|------|-------|-------|
| Like | Nouveau like sur SPLove 💜 | Découvre son profil dans tes likes :) |
| Message | Nouveau message 💬 | Tu as reçu un nouveau message sur SPLove. |
| Match | C'est un match 💘 | Vous pouvez lancer l'échange sur SPLove. |

## 6. Deep links (au clic)

| Type | Route |
|------|-------|
| Like | `/likes-you` |
| Message | `/chat/:conversationId` |
| Match | `/match/:conversationId` |

Champ `route` (+ `kind`, `conversationId`) dans le payload data.

## 7. Pas de push si déjà sur l’écran

- L’app met à jour `device_tokens.active_route` / `active_conversation_id` à chaque navigation.
- L’Edge Function ignore l’envoi si la présence a moins de 45 s et correspond à l’écran cible.
- En premier plan, le client log `PUSH_NOTIFICATION_SUPPRESSED_FOREGROUND` si même écran.

## 8. Permission utilisateur

- Après **onboarding** : `offerPushNotificationsAfterOnboarding`
- Après **connexion** : `offerPushNotificationsAfterLogin` (une fois)
- Manuel : écran **Notifications** → « Activer les notifications »

## 9. Vérification

```sql
SELECT user_id, platform, left(token, 16), active_route, presence_updated_at
FROM public.device_tokens
ORDER BY updated_at DESC
LIMIT 5;
```

Logs app : `PUSH_TOKEN_SAVED`, `PUSH_NOTIFICATION_OPENED`.

Logs Edge : `[send-push] { kind, sent, skipped }`.
