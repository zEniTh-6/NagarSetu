import { useQuery } from "@tanstack/react-query";
import { notificationsApi, qk } from "../../api/citizen.js";

export const NOTIFICATION_POLL_MS = 30_000;

/** Notifications, polled every 30 s while the page is visible (in-app only; no WebSockets). */
export function useNotifications({ enabled = true } = {}) {
  return useQuery({
    queryKey: qk.notifications,
    queryFn: () => notificationsApi.list({ pageSize: 50 }),
    refetchInterval: NOTIFICATION_POLL_MS,
    refetchIntervalInBackground: false,
    enabled,
  });
}
