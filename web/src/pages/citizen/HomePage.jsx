import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Camera, MailWarning, Newspaper } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { CategoryChips } from "../../components/citizen/CategoryChips.jsx";
import { FeedCard } from "../../components/citizen/FeedCard.jsx";
import { feedApi, qk } from "../../api/citizen.js";
import { useMe } from "../../auth/session.js";
import { errorText } from "../../lib/errors.js";

const PAGE = 20;

// Home = public feed (design/stitch/citizen/home-feed). Only public reports (D-022). Not copied
// from Stitch: search box, downvotes, share. The citizen's own reports live in My complaints.
export default function HomePage() {
  const { t, i18n } = useTranslation();
  const { user } = useMe();
  const [category, setCategory] = useState(null);
  const q = useInfiniteQuery({
    queryKey: qk.feed(category),
    queryFn: ({ pageParam }) => feedApi.list({ category: category ?? undefined, page: pageParam, pageSize: PAGE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-h1 text-charcoal-900">{t("feed.title")}</h1>
        <p className="mt-1 text-body text-graphite-600">{t("feed.subtitle")}</p>
      </header>

      {user && !user.emailVerified && (
        <Alert
          tone="warning"
          title={t("home.verifyTitle")}
          action={
            <Button size="sm" to="/verify-email" leftIcon={MailWarning}>
              {t("home.verifyAction")}
            </Button>
          }
        >
          {t("home.verifyBody")}
        </Alert>
      )}

      <CategoryChips value={category} onChange={setCategory} />

      {q.isPending ? (
        <div className="flex justify-center py-16 text-teal-700">
          <Spinner />
        </div>
      ) : q.error ? (
        <Alert tone="error" title={errorText(t, i18n, q.error)} action={<Button size="sm" onClick={() => q.refetch()}>{t("common.retry")}</Button>} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Newspaper}
            title={t(category ? "feed.emptyFiltered" : "feed.empty")}
            message={t("feed.emptyBody")}
            action={
              <Button leftIcon={Camera} to="/citizen/report">
                {t("feed.reportCta")}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <ul className="space-y-4">
            {items.map((issue) => (
              <li key={issue.id}>
                <FeedCard issue={issue} />
              </li>
            ))}
          </ul>
          {q.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="outline" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                {t("feed.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
