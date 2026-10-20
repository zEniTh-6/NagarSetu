import { useQuery } from "@tanstack/react-query";
import { issuesApi, qk } from "../../api/citizen.js";

export const CHECKING_POLL_MS = 5000;
const MAX_POLLS = 36; // ~3 minutes; after that the citizen can come back later

/** One issue (citizen view). Polls while the photo check is still running. */
export function useIssue(id) {
  return useQuery({
    queryKey: qk.issue(id),
    queryFn: () => issuesApi.get(id).then((r) => r.issue),
    refetchInterval: (q) =>
      q.state.data?.status === "REPORTED" && q.state.data?.validation?.state === "CHECKING" && q.state.dataUpdateCount < MAX_POLLS
        ? CHECKING_POLL_MS
        : false,
  });
}
