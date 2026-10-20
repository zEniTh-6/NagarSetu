// Route guards. UX only: the server already enforces every rule (401/403/404).
import { useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { EXPIRED_KEY, homePathFor, useMe } from "./session.js";
import { FullPageSpinner } from "../components/Spinner.jsx";

/** Signed-in users with one of `roles`. Others go to login, change-password or their own home. */
export function RequireRole({ roles, allowPasswordChange = false }) {
  const { user, isLoading } = useMe();
  const qc = useQueryClient();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    const expired = qc.getQueryData(EXPIRED_KEY) ? "&expired=1" : "";
    return <Navigate to={`/login?next=${next}${expired}`} replace />;
  }
  if (user.mustChangePassword && !allowPasswordChange) return <Navigate to="/change-password" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathFor(user)} replace />;
  return <Outlet />;
}

/**
 * Login, signup, forgot password: someone who arrives already signed in goes to their home.
 * Signing in on one of these pages doesn't trigger it; the page navigates itself (keeping ?next).
 */
export function PublicOnly() {
  const { user, isLoading } = useMe();
  const signedInOnArrival = useRef(null);
  if (isLoading) return <FullPageSpinner />;
  if (signedInOnArrival.current === null) signedInOnArrival.current = !!user;
  if (user && signedInOnArrival.current) return <Navigate to={homePathFor(user)} replace />;
  return <Outlet />;
}

/** "/" → wherever the user belongs. */
export function HomeRedirect() {
  const { user, isLoading } = useMe();
  if (isLoading) return <FullPageSpinner />;
  return <Navigate to={homePathFor(user)} replace />;
}
