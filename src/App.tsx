import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { LegalNoticeProvider } from "./contexts/LegalNoticeContext";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Auth from "./pages/Auth";
import AppIntro from "./pages/AppIntro";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import { RecoveryRedirect } from "./components/RecoveryRedirect";
import { OnboardingRouteGate } from "./components/OnboardingRouteGate";
import Discover from "./pages/Discover";
import LikesYou from "./pages/LikesYou";
import Profile from "./pages/Profile";
import EditProfile from "./pages/EditProfile";
import Chat from "./pages/Chat";
import Match from "./pages/Match";
import SplovePlus from "./pages/SplovePlus";
import Checkout from "./pages/Checkout";
import Messages from "./pages/Messages";
import AccountSettings from "./pages/AccountSettings";
import MesRencontres from "./pages/MesRencontres";
import AuthCallback from "./pages/AuthCallback";
import SecondChancesInbox from "./pages/SecondChancesInbox";
import SecondChanceDecision from "./pages/SecondChanceDecision";
import Analytics from "./pages/Analytics";
import InviteFriendScreen from "./screens/InviteFriendScreen";
import Notifications from "./pages/Notifications";
import LegalCGU from "./pages/LegalCGU.tsx";
import PrivacyPolicy from "./pages/PrivacyPolicy.tsx";
import { PublicRootEntry } from "./components/PublicRootEntry";
import { BootSplashGate } from "./components/BootSplashGate";
import { PostOAuthSplashGate } from "./components/PostOAuthSplashGate";
import { isOauthProcessingLocked } from "./lib/oauthCallbackLock";
import { isNativeCapacitorApp } from "./lib/authRedirect";
import OAuthGoogleStart from "./pages/OAuthGoogleStart";
import { OAUTH_GOOGLE_START_PATH } from "./lib/oauthGoogleStartUrl";
import { PushNotificationsBridge } from "./components/PushNotificationsBridge";
import { LegalNoticeGate } from "./components/legal/LegalNoticeGate";
import { NativeShellVisibilityBridge } from "./components/NativeShellVisibilityBridge";
import { SplashScreen } from "./components/SplashScreen";

function AppRouteRedirectFallback() {
  return <SplashScreen overlay />;
}

function App() {
  const oauthLocked = isOauthProcessingLocked();
  const hash = window.location.hash;
  const native = isNativeCapacitorApp();

  if (
    !oauthLocked &&
    window.location.pathname === "/auth/callback" &&
    hash &&
    /^#\/(profile|discover|onboarding)(\/|$|[?#])/.test(hash)
  ) {
    if (native) {
      window.location.hash = hash.startsWith("#") ? hash : `#${hash}`;
    } else {
      window.location.replace(window.location.origin + hash);
    }
    return <AppRouteRedirectFallback />;
  }
  if (!oauthLocked && window.location.pathname === "/auth/callback" && !window.location.hash) {
    const callbackHash = `#/auth/callback${window.location.search}`;
    if (native) {
      window.location.hash = callbackHash;
    } else {
      window.location.replace(`${window.location.origin}${import.meta.env.BASE_URL}${callbackHash}`);
    }
    return <AppRouteRedirectFallback />;
  }
  if (window.location.pathname === OAUTH_GOOGLE_START_PATH && !window.location.hash) {
    const startHash = `#${OAUTH_GOOGLE_START_PATH}${window.location.search}`;
    if (native) {
      window.location.hash = startHash;
    } else {
      window.location.replace(`${window.location.origin}${import.meta.env.BASE_URL}${startHash}`);
    }
    return <AppRouteRedirectFallback />;
  }
  if (window.location.pathname === "/cgu" && !window.location.hash) {
    if (native) {
      window.location.hash = "#/cgu";
    } else {
      window.location.replace(`${window.location.origin}${import.meta.env.BASE_URL}#/cgu`);
    }
    return <AppRouteRedirectFallback />;
  }
  if (window.location.pathname === "/privacy" && !window.location.hash) {
    if (native) {
      window.location.hash = "#/privacy";
    } else {
      window.location.replace(`${window.location.origin}${import.meta.env.BASE_URL}#/privacy`);
    }
    return <AppRouteRedirectFallback />;
  }
  /** Recovery URL : bootstrapApp.tsx établit la session avant le render — ne pas stripper les tokens ici. */

  return (
    <HashRouter>
      <AuthProvider>
        <LegalNoticeProvider>
        <NativeShellVisibilityBridge />
        <PushNotificationsBridge />
        <LegalNoticeGate />
        <BootSplashGate>
        <PostOAuthSplashGate>
          <RecoveryRedirect />
          <Routes>
          <Route path="/" element={<PublicRootEntry />} />
          <Route path="/app-intro" element={<AppIntro />} />
          <Route path="/auth" element={<Auth />} />
          {/* OAuth return: outside ProtectedRoute; AuthContext must not force /auth on this path */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path={OAUTH_GOOGLE_START_PATH} element={<OAuthGoogleStart />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/bienvenue" element={<Navigate to="/" replace />} />
          <Route path="/cgu" element={<LegalCGU />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Routes>
                  <Route element={<AppLayout />}>
                    <Route path="/onboarding" element={<OnboardingRouteGate />} />
                    <Route path="/discover" element={<Navigate to="/move" replace />} />
                    <Route path="/move" element={<Discover />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/activity" element={<Navigate to="/discover" replace />} />
                    <Route path="/messages" element={<Messages />} />
                    <Route path="/mes-rencontres" element={<MesRencontres />} />
                    <Route path="/likes-you" element={<LikesYou />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/profile/edit" element={<EditProfile />} />
                    <Route path="/account-settings" element={<AccountSettings />} />
                    <Route path="/invite" element={<InviteFriendScreen />} />
                    <Route path="/splove-plus" element={<SplovePlus />} />
                    <Route path="/checkout" element={<Checkout />} />
                    <Route path="/match/:conversationId" element={<Match />} />
                    <Route path="/chat/:conversationId" element={<Chat />} />
                    <Route path="/second-chances" element={<SecondChancesInbox />} />
                    <Route path="/second-chance/:requestId" element={<SecondChanceDecision />} />
                    <Route path="/analytics" element={<Analytics />} />
                  </Route>
                </Routes>
              </ProtectedRoute>
            }
          />
        </Routes>
        </PostOAuthSplashGate>
        </BootSplashGate>
        </LegalNoticeProvider>
      </AuthProvider>
    </HashRouter>
  );
}

export default App;
