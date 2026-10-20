import { useInfiniteQuery } from "@tanstack/react-query";
import { issuesApi, qk } from "../../api/citizen.js";

const PAGE = 50;

function useList(key, fetchPage) {
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchPage({ page: pageParam, pageSize: PAGE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  return { ...q, items: q.data?.pages.flatMap((p) => p.items) ?? [], total: q.data?.pages[0]?.total ?? 0 };
}

/** Reports the citizen made ("My complaints"). */
export const useMine = () => useList(qk.mine, issuesApi.mine);
/** Reports the citizen supports. */
export const useSupporting = () => useList(qk.supporting, issuesApi.supporting);

export const ACTIVE_STATUSES = ["REPORTED", "ACKNOWLEDGED", "IN_PROGRESS"];
export const ENDED_STATUSES = ["REJECTED", "DUPLICATE", "WITHDRAWN"];
