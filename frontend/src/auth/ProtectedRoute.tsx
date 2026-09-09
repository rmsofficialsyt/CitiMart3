import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";

export function ProtectedRoute({ role }: { role?: "admin" }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-64" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (role === "admin" && user.role !== "admin") {
    return <Navigate to="/app" replace />;
  }

  return <Outlet />;
}
