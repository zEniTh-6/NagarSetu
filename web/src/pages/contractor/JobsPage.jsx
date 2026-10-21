// My jobs (design/stitch/contractor/my-jobs): New / In progress / Submitted / Completed.
// Only the contractor's own jobs (the server decides). Not copied from Stitch: SLA record, GPS
// "active" badge, ward filters, official-portal wording.
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ClipboardList } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { JobCard } from "../../components/contractor/JobBits.jsx";
import { contractorApi, ck } from "../../api/contractor.js";
import { errorText } from "../../lib/errors.js";
import { cx } from "../../lib/cx.js";

export const TABS = [
  { key: "new", stages: ["NEW"] },
  { key: "inProgress", stages: ["IN_PROGRESS", "REWORK"] },
  { key: "submitted", stages: ["SUBMITTED"] },
  { key: "completed", stages: ["COMPLETED"] },
];

export default function JobsPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((x) => x.key === params.get("tab")) ?? TABS[0];
  const active = useQuery({ queryKey: ck.jobs, queryFn: contractorApi.jobs, refetchInterval: 60_000 });
  const completed = useQuery({ queryKey: ck.completed, queryFn: () => contractorApi.completed() });
  const q = tab.key === "completed" ? completed : active;
  const items = (q.data?.items ?? []).filter((j) => tab.stages.includes(j.stage));
  const count = (x) => (x.key === "completed" ? completed.data?.total : active.data?.items.filter((j) => x.stages.includes(j.stage)).length);

  const select = (key) => setParams(key === "new" ? {} : { tab: key }, { replace: true });
  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
    select(next.key);
    document.getElementById(`jobs-tab-${next.key}`)?.focus();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-h1 text-charcoal-900">{t("contractor.jobs.title")}</h1>
      <p className="mt-1 text-body text-graphite-600">{t("contractor.jobs.subtitle")}</p>

      <div role="tablist" aria-label={t("contractor.jobs.title")} onKeyDown={onKeyDown} className="mt-5 grid grid-cols-2 gap-2 sm:flex">
        {TABS.map((x) => {
          const selected = x === tab;
          const n = count(x);
          return (
            <button
              key={x.key}
              id={`jobs-tab-${x.key}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls="jobs-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => select(x.key)}
              className={cx(
                "flex min-h-12 items-center justify-center gap-1.5 rounded-control px-2 text-label transition-colors sm:flex-1",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700",
                selected ? "border-2 border-teal-700 bg-sage-100 font-bold text-charcoal-900" : "border border-stone-300 bg-white font-medium text-graphite-600",
              )}
            >
              {selected && <Check aria-hidden="true" className="size-4 text-teal-700" />}
              {t(`contractor.jobs.tab.${x.key}`)}
              {n > 0 && <span className="tnum">({n})</span>}
            </button>
          );
        })}
      </div>

      <div id="jobs-panel" role="tabpanel" aria-labelledby={`jobs-tab-${tab.key}`} className="mt-5">
        {q.isPending ? (
          <div className="flex justify-center py-12 text-teal-700">
            <Spinner />
          </div>
        ) : q.error ? (
          <Alert tone="error" title={errorText(t, i18n, q.error)} action={<Button size="sm" variant="outline" onClick={() => q.refetch()}>{t("common.retry")}</Button>} />
        ) : items.length === 0 ? (
          <Card>
            <EmptyState icon={ClipboardList} title={t(`contractor.jobs.empty.${tab.key}`)} />
          </Card>
        ) : (
          <ul className="space-y-3">
            {items.map((j) => (
              <li key={j.issueId}>
                <JobCard job={j} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
