import { Camera, ChevronRight, MailWarning } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { IssueCard } from "../../components/citizen/IssueCard.jsx";
import { ACTIVE_STATUSES, useMine, useSupporting } from "../../components/citizen/useMyIssues.js";
import { useMe } from "../../auth/session.js";
import { errorText } from "../../lib/errors.js";

// Phase 7a home: the citizen's own reports. The public feed arrives in 7b (OD-1, D-022).
export default function HomePage() {
  const { t, i18n } = useTranslation();
  const { user } = useMe();
  const mine = useMine();
  const supporting = useSupporting();

  const active = mine.items.filter((i) => ACTIVE_STATUSES.includes(i.status)).length;
  const resolved = mine.items.filter((i) => i.status === "RESOLVED").length;
  const recent = mine.items.slice(0, 3);

  return (
    <div className="space-y-6">
      <h1 className="text-h1 text-charcoal-900">{t("home.welcome", { name: user?.name ?? "" })}</h1>

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

      <Card variant="hero">
        <div>
          <p className="text-eyebrow uppercase text-brass-400">{t("home.heroEyebrow")}</p>
          <h2 className="mt-2 text-h1 text-ivory-50">{t("home.heroTitle")}</h2>
          <p className="mt-2 max-w-md text-body text-sage-100">{t("home.heroBody")}</p>
        </div>
        <Button variant="dark" className="mt-5" leftIcon={Camera} to="/citizen/report">
          {t("home.reportCta")}
        </Button>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {[
          ["active", active, "/citizen/complaints"],
          ["resolved", resolved, "/citizen/complaints?tab=resolved"],
          ["supporting", supporting.total, "/citizen/complaints?tab=supporting"],
        ].map(([key, value, to]) => (
          <Link key={key} to={to} className="rounded-card border border-stone-300 bg-white p-4 hover:bg-ivory-50">
            <p className="tnum text-h1 text-charcoal-900">{mine.isPending ? "–" : value}</p>
            <p className="text-caption text-graphite-600">{t(`home.stat.${key}`)}</p>
          </Link>
        ))}
      </div>

      <section aria-labelledby="recent">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent" className="text-h2 text-charcoal-900">
            {t("home.recent")}
          </h2>
          {mine.items.length > 0 && (
            <Link to="/citizen/complaints" className="inline-flex min-h-11 items-center gap-1 text-label text-teal-700">
              {t("home.seeAll")}
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          )}
        </div>
        {mine.isPending ? (
          <div className="flex justify-center py-8 text-teal-700">
            <Spinner />
          </div>
        ) : mine.error ? (
          <Alert tone="error" title={errorText(t, i18n, mine.error)} />
        ) : recent.length === 0 ? (
          <Card>
            <EmptyState icon={Camera} title={t("home.emptyTitle")} message={t("home.emptyBody")} />
          </Card>
        ) : (
          <div className="space-y-3">
            {recent.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
