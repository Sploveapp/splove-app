# Google OAuth — afficher « SPLove » (pas `*.supabase.co`)

## Symptôme

Sur iPhone, l’écran de consentement Google affiche :

> **Accéder à l’application `qkcmtnhkfhxnfsbybugf.supabase.co`**

au lieu de **SPLove**.

## Cause

Le flux actuel ouvre l’URL Supabase Auth :

```text
https://<PROJECT_REF>.supabase.co/auth/v1/authorize?provider=google&…
```

Ce que Google affiche dépend **uniquement** de la configuration **Google Cloud Console** (écran de consentement OAuth + identifiants), **pas** du code React/Capacitor.

| Configuration | Ce que voit l’utilisateur |
| --- | --- |
| Provider Google Supabase **sans** Client ID / Secret personnalisé | Domaine Supabase (`<ref>.supabase.co`) |
| Client OAuth **Google dédié** + écran de consentement **SPLove** publié / vérifié | **SPLove** (+ logo si marque vérifiée) |
| Domaine Auth personnalisé Supabase (`auth.splove.app`) | URL plus lisible dans la barre ; le **nom** reste piloté par GCP |

**Le code de l’app ne peut pas remplacer le nom affiché par Google** tant que le projet GCP n’est pas configuré et branché dans Supabase.

---

## Prérequis SPLove

| Élément | Valeur |
| --- | --- |
| Ref Supabase (prod) | `qkcmtnhkfhxnfsbybugf` |
| Callback Supabase (obligatoire côté Google) | `https://qkcmtnhkfhxnfsbybugf.supabase.co/auth/v1/callback` |
| App iOS (bundle) | `com.splove.app` |
| Deep link retour natif | `splove://auth/callback` |
| Site public (CGU / privacy) | `https://splove-app.onrender.com` (ou `https://splove.app` si DNS actif) |
| CGU in-app | `#/cgu` → `https://splove-app.onrender.com/#/cgu` |
| Privacy in-app | `#/privacy` → `https://splove-app.onrender.com/#/privacy` |

---

## 1. Google Cloud Console

Projet GCP dédié SPLove (ou projet existant) → [Google Auth Platform](https://console.cloud.google.com/auth/overview).

### 1.1 Écran de consentement OAuth (Branding)

**APIs & Services → OAuth consent screen → Branding** (ou *Google Auth Platform → Branding*).

| Champ | Valeur recommandée |
| --- | --- |
| **App name** | `SPLove` |
| **User support email** | email support SPLove |
| **App logo** | logo SPLove (carré, ≥ 120×120 px) |
| **Application home page** | `https://splove-app.onrender.com` ou `https://splove.app` |
| **Privacy policy** | `https://splove-app.onrender.com/#/privacy` |
| **Terms of service** | `https://splove-app.onrender.com/#/cgu` |
| **Authorized domains** | `onrender.com` et/ou `splove.app` (domaine vérifié dans [Search Console](https://search.google.com/search-console)) |
| **Developer contact** | email équipe |

**Audience** : *External* (utilisateurs Google grand public).

**Scopes** (Data access) — conserver le minimum Supabase :

- `openid`
- `…/auth/userinfo.email`
- `…/auth/userinfo.profile`

Puis **Publish app** (ou soumettre la **vérification de marque** si Google le demande).

> Sans publication / vérification de marque, Google peut n’afficher que le **domaine** (`supabase.co`), pas le nom « SPLove ».  
> Réf. Google : *« Without verification, only your application domain will be visible to users »*.

### 1.2 Identifiants OAuth — Web (obligatoire)

**Credentials → Create credentials → OAuth client ID → Web application**

| Champ | Valeur |
| --- | --- |
| Name | `SPLove — Supabase Auth (web)` |
| **Authorized JavaScript origins** | `https://splove-app.onrender.com`, `https://qkcmtnhkfhxnfsbybugf.supabase.co` |
| **Authorized redirect URIs** | `https://qkcmtnhkfhxnfsbybugf.supabase.co/auth/v1/callback` |

> **Impossible** de mettre `splove://auth/callback` ici : Google n’accepte que des URLs `https`.  
> Le deep link `splove://` est le `redirectTo` **après** traitement Supabase (configuré dans l’app + Redirect URLs Supabase).

Copier **Client ID** et **Client Secret**.

### 1.3 Identifiants OAuth — iOS (recommandé Capacitor)

**Create credentials → OAuth client ID → iOS**

| Champ | Valeur |
| --- | --- |
| Name | `SPLove iOS` |
| Bundle ID | `com.splove.app` |

Copier le **Client ID iOS** (format `….apps.googleusercontent.com`).

### 1.4 Identifiants OAuth — Android (si build Android)

Client Android avec SHA-1 debug + release, comme [doc Supabase Google](https://supabase.com/docs/guides/auth/social-login/auth-google).

---

## 2. Supabase Dashboard

Projet `qkcmtnhkfhxnfsbybugf` → **Authentication**.

### 2.1 Providers → Google

| Champ | Valeur |
| --- | --- |
| Enable Google | ON |
| **Client ID (Web)** | Client ID web (étape 1.2) |
| **Client Secret** | Secret web (étape 1.2) |
| **Client IDs** (liste, séparés par virgule) | Web + iOS (+ Android si applicable) |
| **Skip nonce check** | ON (requis iOS natif / flux Capacitor selon [doc Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google)) |

Ne pas laisser le provider sur les identifiants Google **par défaut** Supabase si l’objectif est d’afficher SPLove.

### 2.2 URL Configuration

| Champ | Valeur |
| --- | --- |
| **Site URL** | `https://splove-app.onrender.com` (pas `localhost` pour prod iPhone) |
| **Redirect URLs** | `splove://auth/callback` |
| | `splove://login-callback` (legacy, optionnel) |
| | `https://splove-app.onrender.com/**` |
| | `http://localhost:5173/**` (dev uniquement) |

---

## 3. Domaine Auth personnalisé (optionnel, pas obligatoire pour le nom)

Supabase → **Project Settings → Custom Domains** → ex. `auth.splove.app`.

- Remplace `<ref>.supabase.co` dans la barre d’adresse pendant une partie du flux.
- **Ne remplace pas** la config GCP : le nom « SPLove » vient toujours de l’écran de consentement.
- Coût / DNS : voir [Custom domains](https://supabase.com/docs/guides/platform/custom-domains).

Si activé, ajouter `https://auth.splove.app` aux **Authorized JavaScript origins** Google et mettre à jour le callback si Supabase le expose sur ce domaine.

---

## 4. Limites techniques (à connaître)

1. **Redirect Google → Supabase**  
   Google redirige toujours vers `https://<projet>.supabase.co/auth/v1/callback` (ou domaine auth custom). On ne peut pas faire pointer Google directement vers `splove://`.

2. **Browser Capacitor (SFSafariViewController)**  
   L’utilisateur voit brièvement les pages Google puis Supabase **dans le navigateur système** — c’est normal. L’app masque le retour avec l’overlay SPLove ; le **texte du consentement** est contrôlé par GCP.

3. **Sans Client OAuth dédié**  
   Supabase utilise son intégration Google partagée → message « Accéder à `….supabase.co` ».

4. **Marque non vérifiée**  
   Même avec un client dédié, Google peut afficher le domaine tant que la marque n’est pas publiée / vérifiée.

5. **Alternative native (hors scope actuel)**  
   SDK Google Sign-In iOS + `signInWithIdToken` évite l’URL `/authorize` Supabase dans le Browser, mais exige un plugin natif et la même config GCP (client iOS).

---

## 5. Validation iPhone

1. Supabase : Client ID + Secret **personnalisés** enregistrés, pas les valeurs vides / par défaut.
2. GCP : App name = **SPLove**, app **Published** (ou test users si mode Testing).
3. Supprimer l’app / se déconnecter de Google si besoin (`prompt: select_account` déjà dans le code).
4. Connexion Google → l’écran doit afficher **SPLove** (ou logo SPLove après vérification marque).
5. Ne doit **plus** afficher uniquement `qkcmtnhkfhxnfsbybugf.supabase.co` comme nom d’application.
6. Retour app : overlay « Connexion sécurisée… » puis Onboarding ou Move.

### Logs dev (Xcode)

Après clic Google, chercher `GOOGLE_AUTH_URL_HAS_PROMPT_SELECT_ACCOUNT` et l’host de l’URL.  
Si le message branding apparaît en console, suivre ce guide — ce n’est pas corrigeable côté frontend seul.

---

## 6. Références

- [Supabase — Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase — Custom domains](https://supabase.com/docs/guides/platform/custom-domains)
- [Google — OAuth branding & verification](https://support.google.com/cloud/answer/15549049)
