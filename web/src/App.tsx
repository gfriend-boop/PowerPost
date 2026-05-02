import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/context";
import { AppShell } from "./components/Shell";
import { Dashboard } from "./pages/Dashboard";
import { EditVoice } from "./pages/EditVoice";
import { GetInspired } from "./pages/GetInspired";
import { ImproveDraft } from "./pages/ImproveDraft";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Onboarding } from "./pages/Onboarding";
import { Signup } from "./pages/Signup";
import { Workshop } from "./pages/Workshop";

function ProtectedRoute({
  children,
  requireOnboarding = false,
}: {
  children: React.ReactNode;
  requireOnboarding?: boolean;
}) {
  const { user, onboardingComplete, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
        <span className="muted">Loading...</span>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (requireOnboarding && !onboardingComplete) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, onboardingComplete, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
        <span className="muted">Loading...</span>
      </div>
    );
  }
  if (user) {
    return <Navigate to={onboardingComplete ? "/dashboard" : "/onboarding"} replace />;
  }
  return <>{children}</>;
}

function Routing() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicRoute>
            <Landing />
          </PublicRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicRoute>
            <Signup />
          </PublicRoute>
        }
      />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/onboarding/*"
        element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute requireOnboarding>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/voice/edit"
        element={
          <ProtectedRoute requireOnboarding>
            <EditVoice />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inspire"
        element={
          <ProtectedRoute requireOnboarding>
            <GetInspired />
          </ProtectedRoute>
        }
      />
      <Route
        path="/improve"
        element={
          <ProtectedRoute requireOnboarding>
            <ImproveDraft />
          </ProtectedRoute>
        }
      />
      <Route
        path="/improve/:id"
        element={
          <ProtectedRoute requireOnboarding>
            <ImproveDraft />
          </ProtectedRoute>
        }
      />
      <Route
        path="/workshop"
        element={
          <ProtectedRoute requireOnboarding>
            <Workshop />
          </ProtectedRoute>
        }
      />
      <Route
        path="/workshop/:id"
        element={
          <ProtectedRoute requireOnboarding>
            <Workshop />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell>
          <Routing />
        </AppShell>
      </AuthProvider>
    </BrowserRouter>
  );
}
