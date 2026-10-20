import { lazy, Suspense } from "react";
import { MapPinned } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { useMine, useSupporting } from "../../components/citizen/useMyIssues.js";
import { errorText } from "../../lib/errors.js";

const IssuesMap = lazy(() => import("../../components/citizen/IssuesMap.jsx"));

// Phase 7a: your reports and the ones you support. All public issues come with the feed in 7b.
export default function MapPage() {
  const { t, i18n } = useTranslation();
  const mine = useMine();
  const supporting = useSupporting();
  const loading = mine.isPending || supporting.isPending;
  const error = mine.error ?? supporting.error;
  const seen = new Set();
  const issues = [...mine.items, ...supporting.items].filter((i) => (seen.has(i.id) ? false : seen.add(i.id)));

  return (
    <div>
      <h1 className="text-h1 text-charcoal-900">{t("map.title")}</h1>
      <p className="mt-1 text-body text-graphite-600">{t("map.subtitle")}</p>
      <div className="mt-5">
        {loading ? (
          <div className="flex justify-center py-16 text-teal-700">
            <Spinner />
          </div>
        ) : error ? (
          <Alert tone="error" title={errorText(t, i18n, error)} />
        ) : issues.length === 0 ? (
          <Card>
            <EmptyState icon={MapPinned} title={t("map.empty")} message={t("map.emptyBody")} action={<Button to="/citizen/report">{t("home.reportCta")}</Button>} />
          </Card>
        ) : (
          <Suspense fallback={<div className="h-[60dvh] rounded-card bg-white" />}>
            <IssuesMap issues={issues} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
