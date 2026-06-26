# Verrous de stabilité SPLove

Deux zones critiques sont considérées **stables** et verrouillées. Toute modification future doit être **isolée**, **testée**, et limitée au périmètre du bug signalé.

## OAuth Google / Apple (iOS + Android)

**Ne pas modifier** sans demande explicite :

- `src/lib/capacitorOAuth.ts`
- `src/lib/completeNativeOAuthReturn.ts`
- `src/lib/postGoogleAuthComplete.ts`
- `src/lib/oauthCallbackParams.ts`
- `src/lib/oauthCallbackLock.ts`
- `src/lib/iosGoogleOAuthBrowserTarget.ts`
- `src/lib/iosGoogleOAuthDisplay.ts`
- `src/lib/googleOAuthNativeBrowserUrl.ts`
- `src/pages/AuthCallback.tsx`
- `src/pages/OAuthGoogleStart.tsx`
- PKCE (`oauthPkceDiagnostics`, clés `code_verifier` / `code_challenge`)
- `redirectTo` natif : `splove://auth/callback`
- Récupération session (`oauthSessionRecoveryDiag`, `authSessionSyncBridge`)
- Routage auth post-login (`profileSelect.resolvePostOAuthPath`, `postGoogleAuthComplete`)
- `src/components/BootSplashGate.tsx`
- `src/components/PostOAuthSplashGate.tsx`

Comportement attendu : un clic Google ouvre le navigateur système, le callback `splove://auth/callback?code=…` est traité **une seule fois**, la session est établie, puis redirection vers `/onboarding` (profil incomplet) ou `/move` (profil complet), sans boucle `Browser.open` / probe / `app_state`.

## Photos de profil

**Ne pas modifier** sans demande explicite :

- `src/lib/profilePhotoNormalize.ts`
- `src/lib/profilePhotoUpload.ts`
- `src/lib/profilePhotoStoragePath.ts` / bucket `profile-photos`
- `src/lib/profilePhotoCapacitorUpload.ts`
- `src/lib/onboardingProfilePhotos.ts`
- Upload onboarding : `src/pages/Onboarding.tsx` (sections photo)
- Upload profil : `src/pages/EditProfile.tsx` (sections photo)
- Colonnes persistées : `portrait_url`, `main_photo_url`, `avatar_url`, `fullbody_url`
- Affichage : `useProfilePhotoDisplaySrc`, `profilePhotoDisplayUrl`, `profilePhotoSignedUrl`

Comportement attendu : onboarding et EditProfile passent par le même pipeline (`uploadProfilePhoto` → JPEG → Storage → URLs canoniques en BDD → affichage Discover / Profil / Likes / Messages).

## Règle générale

1. Identifier si le bug touche OAuth ou photos.
2. Si non : ne pas toucher aux fichiers listés ci-dessus.
3. Ajouter ou mettre à jour un test dans `stabilityLocksRegression.test.ts` ou les tests de régression existants.
4. `npm run build` + tests ciblés avant merge.
