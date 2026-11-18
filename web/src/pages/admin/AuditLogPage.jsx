// Audit log (design/mockups/admin/audit-log): read-only, department-scoped by the server (D-026).
// Who, when, what, why. Nothing here can be changed or deleted.
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { Input } from "../../components/Input.jsx";
import { Select } from "../../components/Select.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { PageHeader, Pager, Ref, When } from "../../components/admin/AdminBits.jsx";
import { adminApi, ak } from "../../api/admin.js";
import { errorText } from "../../lib/errors.js";

export const AUDIT_ACTIONS = [
  "ISSUE_CREATED", "ISSUE_STATUS_CHANGED", "ISSUE_PHOTO_REPLACED", "ISSUE_REROUTED", "ISSUE_LINKED_DUPLICATE", "ISSUE_PRIORITY_SET",
  "ISSUE_REOPENED", "FEEDBACK_RECORDED", "DISPUTE_DISMISSED", "FLAG_ADDED", "FLAG_CLEARED", "FLAG_CONFIRMED", "OVERRIDE",
  "ASSIGNMENT_CREATED", "ASSIGNMENT_ENDED", "DEADLINE_SET", "SUBMISSION_CREATED", "SUBMISSION_APPROVED", "SUBMISSION_REJECTED",
  "COMMENT_HIDDEN", "OFFICIAL_REPLY_POSTED", "USER_CREATED", "USER_DEACTIVATED", "USER_REACTIVATED", "USER_LOCKED", "USER_UNLOCKED",
  "INVITE_CREATED", "INVITE_ACCEPTED", "EMAIL_VERIFIED", "PASSWORD_CHANGED", "PASSWORD_RESET",
];
const ACTORS = ["ME", "ADMIN", "CITIZEN", "CONTRACTOR", "SYSTEM"];
const TARGETS = ["ISSUE", "ASSIGNMENT", "SUBMISSION", "COMMENT", "USER", "INVITE"];
const dayStart = (v, plus = 0) => {
  if (!v) return undefined;
  const d = new Date(`${v}T00:00:00`);
  d.setDate(d.getDate() + plus);
  return d.toISOString();
};

/** Short, readable details (status changes, categories, priorities); raw ids are left out. */
function Details({ details }) {
  const { t } = useTranslation();
  const parts = [];
  if (details.from && details.to) parts.push(`${t(`status.${details.from}`, { defaultValue: details.from })} → ${t(`status.${details.to}`, { defaultValue: details.to })}`);
  if (details.fromCategory && details.toCategory) parts.push(`${details.fromCategory} → ${details.toCategory}`);
  if (details.priority) parts.push(t(`priority.${details.priority}`, { defaultValue: details.priority }));
  if (details.type) parts.push(t(`flag.${details.type}`, { defaultValue: details.type }));
  if (details.role) parts.push(t(`role.${details.role}`, { defaultValue: details.role }));
  return parts.length ? <span className="text-graphite-600">{parts.join(" · ")}</span> : null;
}

export default function AuditLogPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const get = (k) => params.get(k) ?? "";
  const [issue, setIssue] = useState(get("issue"));
  const filters = {
    action: get("action") || undefined,
    actor: get("actor") || undefined,
    target: get("target") || undefined,
    issue: get("issue") || undefined,
    from: dayStart(get("from")),
    to: dayStart(get("to"), 1),
    page: Number(get("page")) || 1,
    pageSize: 50,
  };
  const q = useQuery({ queryKey: ak.audit(filters), queryFn: () => adminApi.auditLog(filters), placeholderData: keepPreviousData });
  const set = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader title={t("admin.audit.title")} subtitle={t("admin.audit.subtitle")} />
      <Card padding="p-4" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Select label={t("admin.audit.actionLabel")} value={get("action")} onChange={(e) => set({ action: e.target.value })} options={[{ value: "", label: t("admin.issues.any") }, ...AUDIT_ACTIONS.map((a) => ({ value: a, label: t(`admin.audit.action.${a}`) }))]} />
          <Select label={t("admin.audit.who")} value={get("actor")} onChange={(e) => set({ actor: e.target.value })} options={[{ value: "", label: t("admin.issues.any") }, ...ACTORS.map((a) => ({ value: a, label: t(`admin.audit.actor.${a}`) }))]} />
          <Select label={t("admin.audit.about")} value={get("target")} onChange={(e) => set({ target: e.target.value })} options={[{ value: "", label: t("admin.issues.any") }, ...TARGETS.map((a) => ({ value: a, label: t(`admin.audit.target.${a}`) }))]} />
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              set({ issue: issue.trim() });
            }}
          >
            <Input className="flex-1" label={t("admin.audit.issue")} placeholder="#3F8A2C10" value={issue} onChange={(e) => setIssue(e.target.value)} />
            <Button type="submit" variant="outline" aria-label={t("admin.issues.searchButton")}>
              <Search aria-hidden="true" className="size-5" />
            </Button>
          </form>
          <Input type="date" label={t("admin.audit.from")} value={get("from")} onChange={(e) => set({ from: e.target.value })} />
          <Input type="date" label={t("admin.audit.to")} value={get("to")} onChange={(e) => set({ to: e.target.value })} />
        </div>
      </Card>

      {q.isPending ? (
        <Spinner />
      ) : q.error ? (
        <Alert tone="error" title={errorText(t, i18n, q.error)} />
      ) : q.data.items.length === 0 ? (
        <Card>
          <EmptyState icon={History} title={t("admin.audit.empty")} />
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-stone-300 bg-white">
            <table className="w-full min-w-[56rem] text-caption">
              <caption className="sr-only">{t("admin.audit.title")}</caption>
              <thead className="bg-ivory-50 text-eyebrow uppercase text-graphite-600">
                <tr>
                  {["when", "who", "what", "about", "why"].map((c) => (
                    <th key={c} scope="col" className="px-3 py-3 text-start font-semibold">
                      {t(`admin.audit.col.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-300">
                {q.data.items.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-3 text-charcoal-900">
                      <When at={r.at} />
                    </td>
                    <td className="px-3 py-3 text-charcoal-900">
                      {r.actor ? (
                        <>
                          {r.actor.name}
                          <br />
                          <span className="text-graphite-600">{t(`role.${r.actor.role}`)}</span>
                        </>
                      ) : (
                        t("admin.audit.system")
                      )}
                    </td>
                    <td className="px-3 py-3 text-charcoal-900">
                      <p className="font-semibold">{t(`admin.audit.action.${r.action}`, { defaultValue: r.action })}</p>
                      <Details details={r.details} />
                    </td>
                    <td className="px-3 py-3">
                      {r.issueId ? (
                        <Link to={`/admin/issues/${r.issueId}`} className="text-teal-700 underline">
                          <Ref id={r.issueId} />
                        </Link>
                      ) : (
                        <span className="text-charcoal-900">{t(`admin.audit.target.${r.target.type}`, { defaultValue: r.target.type })}</span>
                      )}
                    </td>
                    <td className="max-w-md px-3 py-3 break-words text-charcoal-900">{r.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set({ page: String(p) })} />
        </>
      )}
    </>
  );
}
