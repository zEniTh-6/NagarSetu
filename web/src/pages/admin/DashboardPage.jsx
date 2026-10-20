import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CircleDot, FileSearch, Gavel, Hammer, Inbox, UserX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { FlagChip } from "../../components/FlagChip.jsx";
import { PhotoCompare } from "../../components/PhotoCompare.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { AiRisk, CommunitySignal, PageHeader, Ref } from "../../components/admin/AdminBits.jsx";
import { useDashboard } from "../../components/admin/AdminLayout.jsx";
import { useCategoryName } from "../../components/citizen/CategoryIcon.jsx";
import { adminApi, ak } from "../../api/admin.js";
import { errorText } from "../../lib/errors.js";
import { formatDateTime, formatRelative } from "../../lib/format.js";
import { cx } from "../../lib/cx.js";

const TILES = [
  { key: "newLast24h", icon: Inbox, to: "/admin/issues?status=ALL&sort=newest" },
  { key: "waitingForReview", icon: CircleDot, to: "/admin/issues?status=REPORTED", urgent: true },
  { key: "inProgress", icon: Hammer, to: "/admin/issues?status=IN_PROGRESS" },
  { key: "escalated", icon: AlertTriangle, to: "/admin/issues?status=ACTIVE&flag=ESCALATED", urgent: true },
  { key: "repairsToReview", icon: FileSearch, to: "/admin/issues?status=ALL&stage=REPAIR_REVIEW", urgent: true },
  { key: "disputed", icon: Gavel, to: "/admin/disputes", urgent: true },
];

function Section({ title, action, children }) {
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-h2 text-charcoal-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ReviewList() {
  const { t, i18n } = useTranslation();
  const categoryName = useCategoryName();
  const filters = { status: "REPORTED", sort: "oldest", pageSize: 5 };
  const q = useQuery({ queryKey: ak.issues(filters), queryFn: () => adminApi.issues(filters) });
  if (q.isPending) return <Spinner />;
  if (q.error) return <Alert tone="error" title={errorText(t, i18n, q.error)} />;
  if (!q.data.items.length) return <Card><EmptyState icon={Inbox} title={t("admin.dashboard.reviewEmpty")} /></Card>;
  return (
    <ul className="space-y-3">
      {q.data.items.map((i) => (
        <li key={i.id}>
          <Card padding="p-4" className="flex flex-wrap items-start gap-4">
            {i.photo && <img src={i.photo.url} alt="" className="size-20 shrink-0 rounded-control border border-stone-300 object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="text-caption text-graphite-600">
                <Ref id={i.id} /> · {categoryName(i.category)} · {formatRelative(i.createdAt, i18n.resolvedLanguage)}
              </p>
              {/* The citizen's words, as written. */}
              <p className="mt-1 line-clamp-2 text-body text-charcoal-900">{i.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <AiRisk level={i.ai?.riskLevel} />
                {i.flags.map((f) => (
                  <FlagChip key={f.id} flag={f.type} />
                ))}
              </div>
              <div className="mt-2">
                <CommunitySignal community={i.community} compact />
              </div>
            </div>
            <Button size="sm" to={`/admin/issues/${i.id}`} rightIcon={ArrowRight}>
              {t("admin.dashboard.review")}
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function EvidenceList() {
  const { t, i18n } = useTranslation();
  const filters = { status: "SUBMITTED", pageSize: 3 };
  const q = useQuery({ queryKey: ak.submissions(filters), queryFn: () => adminApi.submissions(filters) });
  const lang = i18n.resolvedLanguage;
  if (q.isPending) return <Spinner />;
  if (q.error) return <Alert tone="error" title={errorText(t, i18n, q.error)} />;
  if (!q.data.items.length) return <Card><EmptyState icon={FileSearch} title={t("admin.dashboard.evidenceEmpty")} /></Card>;
  return (
    <ul className="space-y-3">
      {q.data.items.map((s) => (
        <li key={s.id}>
          <Card padding="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-caption text-graphite-600">
                <Ref id={s.issue.id} /> · {s.contractor?.name} · {t("admin.dashboard.submitted", { when: formatRelative(s.submittedAt, lang) })}
              </p>
              <Button size="sm" to={`/admin/issues/${s.issue.id}/repair`} rightIcon={ArrowRight}>
                {t("admin.dashboard.verify")}
              </Button>
            </div>
            <PhotoCompare
              before={s.issue.photo && { src: s.issue.photo.url, alt: t("admin.photo.before"), time: formatDateTime(s.issue.createdAt, lang) }}
              after={s.photo && { src: s.photo.url, alt: t("admin.photo.after"), time: formatDateTime(s.capturedAt ?? s.submittedAt, lang) }}
            />
          </Card>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { data, isPending, error } = useDashboard();
  return (
    <>
      <PageHeader title={t("admin.dashboard.title")} subtitle={data?.department?.name} />
      {error && <Alert tone="error" title={errorText(t, i18n, error)} />}
      {isPending ? (
        <div className="flex justify-center py-12 text-teal-700">
          <Spinner />
        </div>
      ) : (
        data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {TILES.map(({ key, icon: Icon, to, urgent }) => {
                const n = data[key] ?? 0;
                return (
                  <Link key={key} to={to} className="rounded-card border border-stone-300 bg-white p-4 hover:bg-ivory-50 focus-visible:outline-2 focus-visible:outline-teal-700">
                    <p className="flex items-center justify-between gap-2 text-eyebrow uppercase text-graphite-600">
                      {t(`admin.dashboard.tile.${key}`)}
                      <Icon aria-hidden="true" className="size-5 shrink-0" />
                    </p>
                    <p className={cx("tnum mt-2 text-h1", urgent && n > 0 ? "text-error" : "text-charcoal-900")}>{n}</p>
                  </Link>
                );
              })}
            </div>
            {data.needsReassignment > 0 && (
              <Alert
                tone="warning"
                className="mt-4"
                title={t("admin.dashboard.reassign", { count: data.needsReassignment })}
                action={
                  <Button size="sm" variant="outline" leftIcon={UserX} to="/admin/contractors?includeInactive=true">
                    {t("admin.nav.contractors")}
                  </Button>
                }
              />
            )}
            <div className="mt-8 grid gap-8 xl:grid-cols-2">
              <Section
                title={t("admin.dashboard.needsReview")}
                action={
                  <Link to="/admin/issues?status=REPORTED&sort=oldest" className="text-label text-teal-700 hover:underline">
                    {t("admin.dashboard.seeAll")}
                  </Link>
                }
              >
                <ReviewList />
              </Section>
              <Section
                title={t("admin.dashboard.evidence")}
                action={
                  <Link to="/admin/issues?status=ALL&stage=REPAIR_REVIEW" className="text-label text-teal-700 hover:underline">
                    {t("admin.dashboard.seeAll")}
                  </Link>
                }
              >
                <EvidenceList />
              </Section>
            </div>
          </>
        )
      )}
    </>
  );
}
