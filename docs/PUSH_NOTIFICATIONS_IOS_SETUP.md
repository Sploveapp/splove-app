# Push notifications iOS — SPLove (Capacitor + Supabase)

## Prérequis

- Compte **Apple Developer** (programme payant)
- Projet Supabase avec migration `111_device_tokens.sql` appliquée
- App compilée sur **appareil physique** (le simulateur ne reçoit pas de vrais push APNs)

## 1. Build web + sync Capacitor

```bash
npm run build
npx cap sync ios
cd ios/App && pod install && cd ../..
npx cap open ios
```

## 2. Xcode — Signing & Capabilities

1. Ouvrir **`ios/App/App.xcworkspace`** (pas le `.xcodeproj` seul).
2. Cible **App** → onglet **Signing & Capabilities**.
3. **Team** : sélectionner votre équipe Apple Developer.
4. **Bundle Identifier** : `com.splove.app` (identique à `capacitor.config.ts`).
5. Cliquer **+ Capability** → ajouter **Push Notifications**.
6. Cliquer **+ Capability** → ajouter **Background Modes** → cocher **Remote notifications**  
   (déjà présent dans `Info.plist` via `UIBackgroundModes` / `remote-notification`).

## 3. Clé APNs (Apple Developer)

1. [developer.apple.com](https://developer.apple.com) → **Certificates, Identifiers & Profiles**.
2. **Identifiers** → `com.splove.app` → activer **Push Notifications** → Save.
3. **Keys** → **+** → cocher **Apple Push Notifications service (APNs)** → créer une clé `.p8`.
4. Noter **Key ID**, **Team ID**, et télécharger le fichier `.p8` (une seule fois).

## 4. Envoyer les push (backend)

Le frontend enregistre le token dans `public.device_tokens` (`platform = 'ios'`).

Pour envoyer une notification :

- Utiliser l’API APNs HTTP/2 avec la clé `.p8`, **ou**
- Un fournisseur (Firebase, OneSignal, Supabase Edge Function + APNs), **ou**
- Une Edge Function Supabase qui lit `device_tokens` et appelle APNs.

Payload recommandé (deep link) :

```json
{
  "aps": {
    "alert": { "title": "Nouveau match", "body": "…" },
    "sound": "default"
  },
  "route": "/match"
}
```

Le champ `route` est lu par `pushNotificationActionPerformed` (HashRouter).

## 5. Test sur iPhone

1. Installer l’app depuis Xcode sur un **iPhone réel**.
2. Terminer l’onboarding **ou** ouvrir **Notifications** → **Activer les notifications**.
3. Vérifier les logs Xcode (console Safari / Xcode) :
   - `PUSH_PERMISSION_REQUEST`
   - `PUSH_PERMISSION_GRANTED`
   - `PUSH_TOKEN_RECEIVED`
   - `PUSH_TOKEN_SAVED`
4. Vérifier Supabase :

```sql
SELECT user_id, platform, left(token, 12) AS token_prefix, updated_at
FROM public.device_tokens
WHERE platform = 'ios'
ORDER BY updated_at DESC
LIMIT 10;
```

## 6. Dépannage

| Symptôme | Cause probable |
|----------|----------------|
| Pas de popup permission | Permission déjà refusée → Réglages iOS → SPLove → Notifications |
| `registrationError` dans les logs | Capabilities Push absentes, profil provisioning, ou simulateur |
| Token reçu mais pas en BDD | Migration `111` non appliquée ou RLS / session expirée |
| Push reçues en foreground seulement | Normal sans backend ; tester avec un envoi APNs réel |
| App ouverte sur tap push | Vérifier `route` dans le payload |

## Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `src/lib/pushNotifications.ts` | Permission, listeners, logs |
| `src/services/deviceTokens.service.ts` | Upsert Supabase |
| `src/pages/Notifications.tsx` | Bouton « Activer les notifications » |
| `src/pages/Onboarding.tsx` | Proposition après onboarding |
| `ios/App/App/AppDelegate.swift` | Relais token APNs → Capacitor |
| `supabase/migrations/111_device_tokens.sql` | Table `device_tokens` |
