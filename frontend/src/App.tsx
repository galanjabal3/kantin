import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";

import CustomerPage from "./pages/CustomerPage";
import LoginPage from "./pages/LoginPage";
import SellerDashboard from "./pages/SellerDashboard";
import AdminPanel from "./pages/AdminPanel";
import NotFound from "./pages/NotFound";
import LandingPage from "./pages/LandingPage";

function App() {
  const token = useAuthStore((s) => s.token);
  const userType = useAuthStore((s) => s.userType);

  const isAuthenticated = !!token;

  // 🔒 Protected (login required)
  const RequireAuth = ({ children }: { children: JSX.Element }) => {
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }
    return children;
  };

  // 🔓 Login page (redirect kalau sudah login)
  const PublicOnly = ({ children }: { children: JSX.Element }) => {
    if (isAuthenticated) {
      return (
        <Navigate to={userType === "admin" ? "/admin" : "/dashboard"} replace />
      );
    }
    return children;
  };

  // 👑 Admin only
  const RequireAdmin = ({ children }: { children: JSX.Element }) => {
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }

    if (userType !== "admin") {
      return <Navigate to="/dashboard" replace />;
    }

    return children;
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* 🏠 ROOT (WAJIB ADA) */}
        <Route
          path="/"
          element={
            token ? (
              <Navigate
                to={userType === "admin" ? "/admin" : "/dashboard"}
                replace
              />
            ) : (
              <LandingPage />
            )
          }
        />

        {/* Customer */}
        <Route path="/r/:slug" element={<CustomerPage />} />

        {/* Login */}
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />

        {/* Seller */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <SellerDashboard />
            </RequireAuth>
          }
        />

        {/* Admin */}
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminPanel />
            </RequireAdmin>
          }
        />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
