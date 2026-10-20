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
import { CitizenLayout } from "./components/citizen/CitizenLayout.jsx";
import HomePage from "./pages/citizen/HomePage.jsx";
import MapPage from "./pages/citizen/MapPage.jsx";
import ComplaintsPage from "./pages/citizen/ComplaintsPage.jsx";
import IssueDetailPage from "./pages/citizen/IssueDetailPage.jsx";
import NotificationsPage from "./pages/citizen/NotificationsPage.jsx";
import ProfilePage from "./pages/citizen/ProfilePage.jsx";
import RetakePage from "./pages/citizen/RetakePage.jsx";
import NotFixedPage from "./pages/citizen/NotFixedPage.jsx";
import ReportPage from "./pages/citizen/report/ReportPage.jsx";
import SubmittedPage from "./pages/citizen/report/SubmittedPage.jsx";
import SupportedPage from "./pages/citizen/report/SupportedPage.jsx";
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
      {
        path: "/citizen",
        element: <CitizenLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "map", element: <MapPage /> },
          { path: "complaints", element: <ComplaintsPage /> },
          { path: "issues/:id", element: <IssueDetailPage /> },
          { path: "notifications", element: <NotificationsPage /> },
          { path: "profile", element: <ProfilePage /> },
        ],
      },
      // Full-screen flows (own header, no bottom navigation).
      { path: "/citizen/report", element: <ReportPage /> },
      { path: "/citizen/report/submitted/:id", element: <SubmittedPage /> },
      { path: "/citizen/report/supported/:id", element: <SupportedPage /> },
      { path: "/citizen/issues/:id/retake", element: <RetakePage /> },
      { path: "/citizen/issues/:id/not-fixed", element: <NotFixedPage /> },
    ],
  },
  { element: <RequireRole roles={["ADMIN"]} />, children: [{ path: "/admin/*", element: <RoleHome /> }] },
  { element: <RequireRole roles={["CONTRACTOR"]} />, children: [{ path: "/contractor/*", element: <RoleHome /> }] },
  { path: "*", element: <NotFoundPage /> },
];

export const createAppRouter = () => createBrowserRouter(routes);
