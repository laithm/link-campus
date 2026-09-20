import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AppShell } from "./components/AppShell";
import { Home } from "./pages/Home";
import { Import } from "./pages/Import";
import { View } from "./pages/View";
import { Search } from "./pages/Search";
import { Settings } from "./pages/Settings";
import { Login } from "./pages/Login";
import { returnPath } from "./auth/returnPath";

// Editor + tree libraries are heavy; only load them when the page is opened.
const Collaborations = lazy(() =>
  import("./pages/Collaborations").then((m) => ({ default: m.Collaborations })),
);
const DatabaseAtlas = lazy(() =>
  import("./pages/DatabaseAtlas").then((m) => ({ default: m.DatabaseAtlas })),
);
const BackendVisualization = lazy(() =>
  import("./pages/BackendVisualization").then((m) => ({
    default: m.BackendVisualization,
  })),
);

// Any unauthenticated route redirects to /login; render nothing until
// GET /auth/me resolves, to avoid a flash of the login form for an
// already-authenticated user (auth handoff, "Route guard").
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { actor, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!actor)
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search + location.hash }}
        replace
      />
    );
  return <>{children}</>;
}

function LoginRoute() {
  const { actor, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (actor) return <Navigate to={returnPath(location.state)} replace />;
  return <Login />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Home />} />
            <Route path="/import" element={<Import />} />
            <Route path="/view" element={<View />} />
            <Route path="/search" element={<Search />} />
            <Route
              path="/network"
              element={
                <Suspense
                  fallback={
                    <div className="empty-state" role="status">
                      Opening the database atlas…
                    </div>
                  }
                >
                  <DatabaseAtlas />
                </Suspense>
              }
            />
            <Route
              path="/collaborations"
              element={
                <Suspense fallback={null}>
                  <Collaborations />
                </Suspense>
              }
            />
            <Route path="/settings" element={<Settings />} />
            <Route
              path="/settings/backend"
              element={
                <Suspense
                  fallback={
                    <div className="empty-state" role="status">
                      Opening the backend graph…
                    </div>
                  }
                >
                  <BackendVisualization />
                </Suspense>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
