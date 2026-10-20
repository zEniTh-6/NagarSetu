import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, ak } from "../../../api/admin.js";

/** The admin review view of one issue (department-scoped by the server). */
export function useAdminIssue(id) {
  return useQuery({ queryKey: ak.issue(id), queryFn: () => adminApi.issue(id).then((r) => r.issue) });
}

/**
 * After an action: use the fresh issue the server returned (when it sends one), and refresh the
 * lists, counts, queues and audit log that may have changed.
 */
export function useAfterAction(id) {
  const qc = useQueryClient();
  return (res) => {
    const fresh = res?.issue;
    if (fresh) qc.setQueryData(ak.issue(id), fresh);
    qc.invalidateQueries({ queryKey: ak.all, predicate: (q) => !(fresh && q.queryKey[1] === "issue" && q.queryKey[2] === id) });
    return res;
  };
}
