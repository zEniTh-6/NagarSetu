import { createBrowserRouter } from "react-router";
import { RequireRole, PublicOnly, HomeRedirect } from "./auth/guards.jsx";
import LoginPage from "./pages/auth/LoginPage.jsx";
import SignupPage from "./pages/auth/SignupPage.jsx";
import VerifyEmailPage from "./pages/auth/VerifyEmailPage.jsx";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage.jsx";
import ChangePasswordPage from "./pages/auth/ChangePasswordPage.jsx";
import AccountBlockedPage from "./pages/auth/AccountBlockedPage.jsx";
import InvitePage from "./pages/auth/InvitePage.jsx";
import RoleHome from "./pages/home/RoleHome.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

// Paths used by the server in emails/links: /reset-password?token=… and /invite/:token.
export const routes = [
  { path: "/", element: <HomeRedirect /> },
  {
    element: <PublicOnly />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/signup", element: <SignupPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
    ],
  },
  // Open to anyone: the link token is the credential.
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/invite/:token", element: <InvitePage /> },
  { path: "/account-blocked", element: <AccountBlockedPage /> },
  {
    element: <RequireRole allowPasswordChange />,
    children: [{ path: "/change-password", element: <ChangePasswordPage /> }],
  },
  {
    element: <RequireRole roles={["CITIZEN"]} />,
    children: [
      { path: "/verify-email", element: <VerifyEmailPage /> },
      { path: "/citizen/*", element: <RoleHome /> },
    ],
  },
  { element: <RequireRole roles={["ADMIN"]} />, children: [{ path: "/admin/*", element: <RoleHome /> }] },
  { element: <RequireRole roles={["CONTRACTOR"]} />, children: [{ path: "/contractor/*", element: <RoleHome /> }] },
  { path: "*", element: <NotFoundPage /> },
];

export const createAppRouter = () => createBrowserRouter(routes);
