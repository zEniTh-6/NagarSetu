// Who is signed in. The server is the authority; this only drives navigation (UX).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../api/auth.js";
import { ApiError } from "../api/client.js";

export const ME_KEY = ["auth", "me"];
/** Set when an API call answered 401 during a session, so login can say "your session ended". */
export const EXPIRED_KEY = ["auth", "expired"];

export const ROLE_HOME = Object.freeze({
  CITIZEN: "/citizen",
  ADMIN: "/admin",
  CONTRACTOR: "/contractor",
});

/** Where a user belongs right after login. */
export function homePathFor(user) {
  if (!user) return "/login";
  if (user.mustChangePassword) return "/change-password";
  return ROLE_HOME[user.role] ?? "/login";
}

/** Only same-app paths are followed after login (no "//evil.com" or absolute URLs). */
export function safeNext(next) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

/** Where to go after login: `next` if it belongs to the user's role, else their home. */
export function afterLoginPath(user, next) {
  const home = homePathFor(user);
  const target = safeNext(next);
  if (!target || user.mustChangePassword) return home;
  const roleRoot = ROLE_HOME[user.role];
  return target === roleRoot || target.startsWith(`${roleRoot}/`) ? target : home;
}

export async function fetchMe() {
  try {
    const { user } = await authApi.me();
    return user;
  } catch (err) {
    // Not signed in (or the account was just deactivated: the server cleared the cookie).
    if (err instanceof ApiError && (err.status === 401 || err.code === "ACCOUNT_DEACTIVATED")) return null;
    throw err;
  }
}

/** { user, isLoading }. user is null when logged out. */
export function useMe() {
  const q = useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 5 * 60 * 1000, retry: false });
  return { user: q.data ?? null, isLoading: q.isPending, error: q.error, refetch: q.refetch };
}

export function useSetMe() {
  const qc = useQueryClient();
  return (user) => {
    qc.setQueryData(EXPIRED_KEY, false);
    qc.setQueryData(ME_KEY, user);
  };
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    try {
      await authApi.logout();
    } finally {
      qc.clear();
      qc.setQueryData(ME_KEY, null);
      qc.setQueryData(EXPIRED_KEY, false);
    }
  };
}
