import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { FlagChip } from "../../components/FlagChip.jsx";
import { Input } from "../../components/Input.jsx";
import { PriorityPill } from "../../components/PriorityPill.jsx";
import { Select } from "../../components/Select.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { StatusBadge } from "../../components/StatusBadge.jsx";
import { AiRisk, CommunitySignal, DeadlineCell, PageHeader, Pager, Ref } from "../../components/admin/AdminBits.jsx";
import { useCategoryName } from "../../components/citizen/CategoryIcon.jsx";
import { adminApi, ak } from "../../api/admin.js";
import { categoriesApi, qk } from "../../api/citizen.js";
import { errorText } from "../../lib/errors.js";
import { formatDate } from "../../lib/format.js";

const STATUSES = ["REPORTED", "ACTIVE", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "REJECTED", "DUPLICATE", "WITHDRAWN", "ALL"];
const FLAGS = ["SUSPICIOUS", "POSSIBLE_DUPLICATE", "PENDING_REVIEW", "ESCALATED", "DISPUTED"];
const LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"];
const SORTS = ["newest", "oldest", "risk", "priority", "support"];
const KEYS = ["status", "flag", "category", "priority", "sort", "q", "from", "to", "stage", "page"];
const PAGE_SIZE = 25;

/** Date input value (yyyy-mm-dd, local day) → ISO start of that day; "to" is exclusive (next day). */
const dayStart = (v, plusDays = 0) => {
  if (!v) return undefined;
  const d = new Date(`${v}T00:00:00`);
  d.setDate(d.getDate() + plusDays);
  return d.toISOString();
};

export default function IssuesPage() {
  const { t, i18n } = useTranslation();
  const categoryName = useCategoryName();
  const [params, setParams] = useSearchParams();
  const get = (k) => params.get(k) ?? "";
  const [q, setQ] = useState(get("q"));
  const categories = useQuery({ queryKey: qk.categories, queryFn: () => categoriesApi.list().then((r) => r.categories), staleTime: Infinity });

  const filters = {
    status: get("status") || "REPORTED",
    flag: get("flag") || undefined,
    category: get("category") || undefined,
    priority: get("priority") || undefined,
    sort: get("sort") || "newest",
    q: get("q") || undefined,
    from: dayStart(get("from")),
    to: dayStart(get("to"), 1),
    stage: get("stage") || undefined,
    page: Number(get("page")) || 1,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({ queryKey: ak.issues(filters), queryFn: () => adminApi.issues(filters), placeholderData: keepPreviousData });

  const set = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  };
  const active = KEYS.some((k) => k !== "page" && k !== "sort" && params.get(k));

  return (
    <>
      <PageHeader title={t("admin.issues.title")} subtitle={t("admin.issues.subtitle")} />

      <Card padding="p-4" className="mb-4">
        <form
          role="search"
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: q.trim() });
          }}
        >
          <Input className="min-w-64 flex-1" label={t("admin.issues.search")} placeholder={t("admin.issues.searchHint")} value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" variant="outline" leftIcon={Search}>
            {t("admin.issues.searchButton")}
          </Button>
        </form>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label={t("admin.issues.status")} value={filters.status} onChange={(e) => set({ status: e.target.value })} options={STATUSES.map((s) => ({ value: s, label: t(`admin.issues.statusOption.${s}`) }))} />
          <Select label={t("admin.issues.flag")} value={get("flag")} onChange={(e) => set({ flag: e.target.value })} options={[{ value: "", label: t("admin.issues.any") }, ...FLAGS.map((f) => ({ value: f, label: t(`flag.${f}`) }))]} />
          <Select
            label={t("admin.issues.category")}
            value={get("category")}
            onChange={(e) => set({ category: e.target.value })}
            options={[{ value: "", label: t("admin.issues.any") }, ...(categories.data ?? []).map((c) => ({ value: c.key, label: categoryName(c) }))]}
          />
          <Select label={t("admin.issues.priority")} value={get("priority")} onChange={(e) => set({ priority: e.target.value })} options={[{ value: "", label: t("admin.issues.any") }, ...LEVELS.map((l) => ({ value: l, label: l === "NONE" ? t("admin.issues.noPriority") : t(`priority.${l}`) }))]} />
          <Input type="date" label={t("admin.issues.from")} value={get("from")} onChange={(e) => set({ from: e.target.value })} />
          <Input type="date" label={t("admin.issues.to")} value={get("to")} onChange={(e) => set({ to: e.target.value })} />
          <Select label={t("admin.issues.sort")} value={filters.sort} onChange={(e) => set({ sort: e.target.value })} options={SORTS.map((s) => ({ value: s, label: t(`admin.issues.sortOption.${s}`) }))} />
          <label className="flex min-h-12 items-center gap-2 self-end text-label text-charcoal-900">
            <input type="checkbox" className="size-5 accent-teal-700" checked={get("stage") === "REPAIR_REVIEW"} onChange={(e) => set({ stage: e.target.checked ? "REPAIR_REVIEW" : "" })} />
            {t("admin.issues.evidenceOnly")}
          </label>
        </div>
        {active && (
          <Button
            size="sm"
            variant="ghost"
            leftIcon={X}
            className="mt-2"
            onClick={() => {
              setQ("");
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            {t("admin.issues.clear")}
          </Button>
        )}
      </Card>

      {list.error && <Alert tone="error" title={errorText(t, i18n, list.error)} />}
      {list.isPending ? (
        <div className="flex justify-center py-12 text-teal-700">
          <Spinner />
        </div>
      ) : list.data && list.data.items.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title={t("admin.issues.empty")} />
        </Card>
      ) : (
        list.data && (
          <>
            <div className="overflow-x-auto rounded-card border border-stone-300 bg-white">
              <table className="w-full min-w-[60rem] text-start text-caption">
                <caption className="sr-only">{t("admin.issues.caption", { count: list.data.total })}</caption>
                <thead className="bg-ivory-50 text-eyebrow uppercase text-graphite-600">
                  <tr>
                    {["ref", "category", "area", "status", "flags", "ai", "signal", "priority", "work"].map((c) => (
                      <th key={c} scope="col" className="px-3 py-3 text-start font-semibold">
                        {t(`admin.issues.col.${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-300">
                  {list.data.items.map((i) => (
                    <tr key={i.id} className="align-top hover:bg-ivory-50">
                      <td className="px-3 py-3">
                        <div className="flex items-start gap-3">
                          {i.photo && <img src={i.photo.url} alt="" className="size-12 shrink-0 rounded-control border border-stone-300 object-cover" />}
                          <div>
                            <Link to={`/admin/issues/${i.id}`} className="text-teal-700 underline-offset-4 hover:underline">
                              <Ref id={i.id} />
                            </Link>
                            <p className="tnum text-graphite-600">{formatDate(i.createdAt, i18n.resolvedLanguage)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-56 px-3 py-3">
                        <p className="font-semibold text-charcoal-900">{categoryName(i.category)}</p>
                        <p className="line-clamp-2 text-charcoal-900">{i.description}</p>
                      </td>
                      <td className="max-w-40 px-3 py-3 text-charcoal-900">{i.addressText || i.areaName || "—"}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={i.status} />
                        {i.repairToReview && <p className="mt-1 font-semibold text-warning">{t("admin.issues.evidenceWaiting")}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-start gap-1">
                          {i.flags.length ? i.flags.map((f) => <FlagChip key={f.id} flag={f.type} />) : <span className="text-graphite-600">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <AiRisk level={i.ai?.riskLevel} />
                      </td>
                      <td className="px-3 py-3">
                        <CommunitySignal community={i.community} compact />
                      </td>
                      <td className="px-3 py-3">{i.priority ? <PriorityPill level={i.priority} /> : <span className="text-graphite-600">—</span>}</td>
                      <td className="px-3 py-3 text-charcoal-900">
                        {i.assignment ? (
                          <>
                            <p>{i.assignment.contractor.name}</p>
                            <DeadlineCell assignment={i.assignment} />
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => set({ page: String(p) })} />
          </>
        )
      )}
    </>
  );
}
