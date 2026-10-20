import { useSearchParams } from "react-router";
import { Check, ClipboardList, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { IssueCard } from "../../components/citizen/IssueCard.jsx";
import { ACTIVE_STATUSES, ENDED_STATUSES, useMine, useSupporting } from "../../components/citizen/useMyIssues.js";
import { errorText } from "../../lib/errors.js";
import { cx } from "../../lib/cx.js";

// Tabs follow real statuses (no "Closed": brief + design/stitch/README.md conflict 7).
const TABS = [
  { key: "active", filter: (i) => ACTIVE_STATUSES.includes(i.status) },
  { key: "resolved", filter: (i) => i.status === "RESOLVED" },
  { key: "ended", filter: (i) => ENDED_STATUSES.includes(i.status) },
  { key: "supporting" },
];

export default function ComplaintsPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const current = TABS.some((x) => x.key === params.get("tab")) ? params.get("tab") : "active";
  const mine = useMine();
  const supporting = useSupporting();

  const tab = TABS.find((x) => x.key === current);
  const source = current === "supporting" ? supporting : mine;
  const items = current === "supporting" ? supporting.items : mine.items.filter(tab.filter);
  const count = (x) => (x.key === "supporting" ? supporting.total : mine.items.filter(x.filter).length);

  const select = (key) => {
    setParams(key === "active" ? {} : { tab: key }, { replace: true });
  };

  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = TABS.findIndex((x) => x.key === current);
    const next = TABS[(i + step + TABS.length) % TABS.length].key;
    select(next);
    e.currentTarget.querySelector(`#tab-${next}`)?.focus();
  };

  return (
    <div>
      <h1 className="text-h1 text-charcoal-900">{t("complaints.title")}</h1>
      <p className="mt-1 text-body text-graphite-600">{t("complaints.subtitle")}</p>

      <div role="tablist" aria-label={t("complaints.title")} onKeyDown={onKeyDown} className="mt-5 grid grid-cols-2 gap-2">
        {TABS.map((x) => {
          const selected = x.key === current;
          const loaded = x.key === "supporting" ? !supporting.isPending : !mine.isPending;
          return (
            <button
              key={x.key}
              id={`tab-${x.key}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls="complaints-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => select(x.key)}
              /* Same selected state as the report's category cards: teal border, sage tint, check, bold. */
              className={cx(
                "flex min-h-12 items-center justify-center gap-1.5 rounded-control px-2 text-label transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700",
                selected
                  ? "border-2 border-teal-700 bg-sage-100 font-bold text-charcoal-900"
                  : "border border-stone-300 bg-white font-medium text-graphite-600 hover:border-field-border hover:text-charcoal-900",
              )}
            >
              {selected && <Check aria-hidden="true" className="size-4 shrink-0 text-teal-700" strokeWidth={3} />}
              {t(`complaints.tab.${x.key}`)}
              {loaded && <span className="tnum ms-1.5 opacity-80">({count(x)})</span>}
            </button>
          );
        })}
      </div>

      <div id="complaints-panel" role="tabpanel" aria-labelledby={`tab-${current}`} className="mt-4 space-y-3">
        {source.isPending ? (
          <div className="flex justify-center py-12 text-teal-700">
            <Spinner />
          </div>
        ) : source.error ? (
          <Alert tone="error" title={errorText(t, i18n, source.error)} action={<Button size="sm" variant="outline" onClick={() => source.refetch()}>{t("common.retry")}</Button>} />
        ) : items.length === 0 ? (
          <Card>
            <EmptyState
              icon={current === "supporting" ? Users : ClipboardList}
              title={t(`complaints.empty.${current}`)}
              message={current === "supporting" ? t("complaints.empty.supportingBody") : undefined}
              action={current === "active" ? <Button to="/citizen/report">{t("home.reportCta")}</Button> : undefined}
            />
          </Card>
        ) : (
          <>
            {current === "ended" && <p className="text-caption text-graphite-600">{t("complaints.endedNote")}</p>}
            {items.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                supporting={current === "supporting"}
                footer={
                  current === "active" && issue.status === "REPORTED" ? (
                    <p className="text-caption text-graphite-600">{t("complaints.canWithdraw")}</p>
                  ) : null
                }
              />
            ))}
            {source.hasNextPage && (
              <Button variant="outline" fullWidth loading={source.isFetchingNextPage} onClick={() => source.fetchNextPage()}>
                {t("complaints.more")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
