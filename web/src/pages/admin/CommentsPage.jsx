// Comment moderation (design/mockups/admin/comment-moderation): reported comments on the department's
// issues, hidden ones, and suspended citizens. Reports are signals; the admin hides (reason, audited)
// and can suspend an abusive account (reason, audited) or reactivate it.
import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareWarning, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { useToast } from "../../components/Toast.jsx";
import { PageHeader, Pager, Ref, When } from "../../components/admin/AdminBits.jsx";
import { ConfirmAction } from "../../components/admin/ConfirmAction.jsx";
import { useCategoryName } from "../../components/citizen/CategoryIcon.jsx";
import { adminApi, ak } from "../../api/admin.js";
import { errorText } from "../../lib/errors.js";
import { cx } from "../../lib/cx.js";
import { AdminComment } from "./review/CommentsPanel.jsx";

const TABS = ["reported", "hidden", "suspended"];

function CommentQueue({ filter }) {
  const { t, i18n } = useTranslation();
  const categoryName = useCategoryName();
  const [page, setPage] = useState(1);
  const filters = { filter, page, pageSize: 20 };
  const q = useQuery({ queryKey: ak.moderation(filters), queryFn: () => adminApi.moderation(filters) });
  if (q.isPending) return <Spinner />;
  if (q.error) return <Alert tone="error" title={errorText(t, i18n, q.error)} />;
  if (!q.data.items.length) return <Card><EmptyState icon={MessageSquareWarning} title={t(`admin.comments.empty.${filter}`)} /></Card>;
  return (
    <>
      <ul className="space-y-4">
        {q.data.items.map((c) => (
          <li key={c.id}>
            <p className="mb-1 text-caption text-graphite-600">
              {t("admin.comments.on")}{" "}
              <Link to={`/admin/issues/${c.issue.id}`} className="text-teal-700 underline">
                <Ref id={c.issue.id} />
              </Link>{" "}
              · {categoryName(c.issue.category)} · <span className="line-clamp-1 inline">{c.issue.description}</span>
            </p>
            <AdminComment comment={c} />
          </li>
        ))}
      </ul>
      <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
    </>
  );
}

function Suspended() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [who, setWho] = useState(null);
  const q = useQuery({ queryKey: ak.suspended, queryFn: () => adminApi.suspended() });
  if (q.isPending) return <Spinner />;
  if (q.error) return <Alert tone="error" title={errorText(t, i18n, q.error)} />;
  if (!q.data.items.length) return <Card><EmptyState icon={UserCheck} title={t("admin.comments.empty.suspended")} /></Card>;
  return (
    <>
      <ul className="space-y-3">
        {q.data.items.map((c) => (
          <li key={c.id}>
            <Card padding="p-4" className="flex flex-wrap items-start justify-between gap-3">
              <div className="text-caption text-charcoal-900">
                <p className="text-label">{c.name}</p>
                <p className="text-graphite-600">
                  {t("admin.comments.suspendedOn")} <When at={c.deactivatedAt} />
                  {c.by && <> · {c.by.name}</>}
                </p>
                {c.reason && <p className="mt-1">{t("admin.comments.suspendReason", { reason: c.reason })}</p>}
              </div>
              <Button size="sm" variant="outline" leftIcon={UserCheck} onClick={() => setWho(c)}>
                {t("admin.comments.reactivate")}
              </Button>
            </Card>
          </li>
        ))}
      </ul>
      <ConfirmAction
        open={Boolean(who)}
        onClose={() => setWho(null)}
        title={t("admin.comments.reactivateTitle", { name: who?.name ?? "" })}
        description={t("admin.comments.reactivateBody")}
        confirmLabel={t("admin.comments.reactivate")}
        reason="required"
        reasonLabel={t("admin.comments.reasonLogged")}
        onConfirm={async (reason) => {
          await adminApi.reactivate(who.id, reason);
          toast.show({ tone: "success", title: t("admin.comments.reactivated") });
          qc.invalidateQueries({ queryKey: ak.all });
        }}
      />
    </>
  );
}

export default function CommentsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("reported");
  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  return (
    <>
      <PageHeader title={t("admin.comments.title")} subtitle={t("admin.comments.subtitle")} />
      <div role="tablist" aria-label={t("admin.comments.title")} onKeyDown={onKeyDown} className="mb-4 flex gap-2">
        {TABS.map((k) => {
          const selected = tab === k;
          return (
            <button
              key={k}
              id={`tab-${k}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls="moderation-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(k)}
              className={cx(
                "min-h-11 rounded-control px-4 text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700",
                selected ? "border-2 border-teal-700 bg-sage-100 px-[15px] font-bold text-charcoal-900" : "border border-stone-300 bg-white font-medium text-graphite-600",
              )}
            >
              {t(`admin.comments.tab.${k}`)}
            </button>
          );
        })}
      </div>
      <div id="moderation-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "suspended" ? <Suspended /> : <CommentQueue key={tab} filter={tab} />}
      </div>
    </>
  );
}
