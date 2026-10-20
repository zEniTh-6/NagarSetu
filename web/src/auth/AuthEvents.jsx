// Connects the API client's auth signals to navigation:
// 401 → login (with ?next), PASSWORD_CHANGE_REQUIRED → change-password, ACCOUNT_DEACTIVATED → blocked screen.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setAuthHandlers } from "../api/client.js";
import { EXPIRED_KEY, ME_KEY } from "./session.js";

export function useAuthEvents(router) {
  const qc = useQueryClient();
  useEffect(() => {
    const here = () => router.state.location;
    setAuthHandlers({
      // The route guard does the redirect to /login?next=…; the flag adds the "session ended" notice.
      onUnauthenticated: () => {
        qc.setQueryData(EXPIRED_KEY, true);
        qc.setQueryData(ME_KEY, null);
      },
      onPasswordChangeRequired: () => {
        qc.invalidateQueries({ queryKey: ME_KEY });
        if (here().pathname !== "/change-password") router.navigate("/change-password", { replace: true });
      },
      onDeactivated: () => {
        qc.clear();
        qc.setQueryData(ME_KEY, null);
        router.navigate("/account-blocked?reason=deactivated", { replace: true });
      },
    });
    return () => setAuthHandlers({ onUnauthenticated: null, onPasswordChangeRequired: null, onDeactivated: null });
  }, [qc, router]);
}
