import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import { RecoveryRedirect } from "./components/RecoveryRedirect";
import Onboarding from "./pages/Onboarding";
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
function App() {
  if (window.location.pathname === "/auth/callback" && !window.location.hash) {
    window.location.replace(`${window.location.origin}${import.meta.env.BASE_URL}#/auth/callback${window.location.search}`);
    return null;
  }

  return (
    <HashRouter>
      <AuthProvider>
        <RecoveryRedirect />
        <Routes>
          <Route path="/auth" element={<Auth />} />
          {/* OAuth return: outside ProtectedRoute; AuthContext must not force /auth on this path */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Routes>
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<Navigate to="/discover" replace />} />
                    <Route path="/onboarding" element={<Onboarding />} />
                    <Route path="/discover" element={<Discover />} />
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
      </AuthProvider>
    </HashRouter>
  );
}

export default App;
