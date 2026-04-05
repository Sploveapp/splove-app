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
import Chat from "./pages/Chat";
import Match from "./pages/Match";
import SplovePlus from "./pages/SplovePlus";
import Checkout from "./pages/Checkout";
import Messages from "./pages/Messages";
function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <RecoveryRedirect />
        <Routes>
          <Route path="/auth" element={<Auth />} />
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
                    <Route path="/discover" element={<Discover />} />
                    <Route path="/activity" element={<Navigate to="/discover" replace />} />
                    <Route path="/messages" element={<Messages />} />
                    <Route path="/likes-you" element={<LikesYou />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/splove-plus" element={<SplovePlus />} />
                    <Route path="/checkout" element={<Checkout />} />
                    <Route path="/match/:conversationId" element={<Match />} />
                    <Route path="/chat/:conversationId" element={<Chat />} />
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
