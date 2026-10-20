// Disputes queue (design/stitch/admin/disputes-queue): resolved issues where a citizen said "not
// fixed". The admin reopens (→ ACKNOWLEDGED, follow-up work) or keeps it resolved; either way the
// reason is shown to the citizens. Nothing happens automatically.
import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gavel, RotateCcw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { PhotoCompare } from "../../components/PhotoCompare.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { useToast } from "../../components/Toast.jsx";
import { PageHeader, Pager, Ref, When } from "../../components/admin/AdminBits.jsx";
import { ConfirmAction } from "../../components/admin/ConfirmAction.jsx";
import { useCategoryName } from "../../components/citizen/CategoryIcon.jsx";
import { adminApi, ak } from "../../api/admin.js";
import { errorText } from "../../lib/errors.js";
import { formatDateTime } from "../../lib/format.js";

function Dispute({ d }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const categoryName = useCategoryName();
  const [open, setOpen] = useState(null);
  const lang = i18n.resolvedLanguage;
  const run = (fn, key) => async (reason) => {
    await fn(d.id, { reason });
    toast.show({ tone: "success", title: t(`admin.review.done.${key}`) });
    qc.invalidateQueries({ queryKey: ak.all });
  };
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-caption text-graphite-600">
            <Link to={`/admin/issues/${d.id}`} className="text-teal-700 underline">
              <Ref id={d.id} />
            </Link>{" "}
            · {categoryName(d.category)} · {d.areaName || d.addressText || ""}
          </p>
          <p className="mt-1 text-body text-charcoal-900">{d.description}</p>
          <p className="mt-1 text-caption text-graphite-600">
            {t("admin.disputes.resolved")} <When at={d.resolvedAt} /> · {t("admin.disputes.disputed")} <When at={d.disputedAt} />
          </p>
        </div>
        {d.counts && (
          <p className="tnum text-caption text-charcoal-900">
            {t("admin.review.feedbackCounts", { fixed: d.counts.fixed, notFixed: d.counts.notFixed, none: d.counts.noResponse })}
          </p>
        )}
      </div>
      <PhotoCompare
        before={d.before && { src: d.before.url, alt: t("admin.photo.before"), time: formatDateTime(d.createdAt, lang) }}
        after={d.after && { src: d.after.url, alt: t("admin.photo.after"), time: formatDateTime(d.resolvedAt, lang) }}
      />
      <h3 className="mt-5 text-label text-charcoal-900">{t("admin.disputes.citizensSay")}</h3>
      <ul className="mt-2 space-y-2">
        {d.notFixed.map((r) => (
          <li key={r.id} className="rounded-control border border-stone-300 p-3 text-caption text-charcoal-900">
            <p className="font-semibold">
              {r.by.name} · <When at={r.at} />
            </p>
            {/* The citizen's words, as written. */}
            <p className="mt-1 text-body">{r.reason}</p>
            {r.photo && <img src={r.photo.url} alt={t("admin.review.feedbackPhoto")} className="mt-2 max-h-48 rounded-control border border-stone-300" />}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="destructive-outline" leftIcon={RotateCcw} onClick={() => setOpen("reopen")}>
          {t("admin.review.reopen")}
        </Button>
        <Button variant="outline" leftIcon={ShieldCheck} onClick={() => setOpen("dismiss")}>
          {t("admin.review.keepResolved")}
        </Button>
      </div>
      <ConfirmAction
        open={open === "reopen"}
        onClose={() => setOpen(null)}
        tone="destructive"
        title={t("admin.review.reopenTitle")}
        description={t("admin.review.reopenBody")}
        confirmLabel={t("admin.review.reopen")}
        reason="required"
        reasonLabel={t("admin.review.reasonForCitizen")}
        onConfirm={run(adminApi.reopen, "reopen")}
      />
      <ConfirmAction
        open={open === "dismiss"}
        onClose={() => setOpen(null)}
        title={t("admin.review.keepTitle")}
        description={t("admin.review.keepBody")}
        confirmLabel={t("admin.review.keepResolved")}
        reason="required"
        reasonLabel={t("admin.review.reasonForCitizen")}
        onConfirm={run(adminApi.dismissDispute, "dismiss")}
      />
    </Card>
  );
}

export default function DisputesPage() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const filters = { page, pageSize: 10 };
  const q = useQuery({ queryKey: ak.disputes(filters), queryFn: () => adminApi.disputes(filters) });
  return (
    <>
      <PageHeader title={t("admin.disputes.title")} subtitle={t("admin.disputes.subtitle")} />
      {q.isPending ? (
        <Spinner />
      ) : q.error ? (
        <Alert tone="error" title={errorText(t, i18n, q.error)} />
      ) : q.data.items.length === 0 ? (
        <Card>
          <EmptyState icon={Gavel} title={t("admin.disputes.empty")} />
        </Card>
      ) : (
        <>
          <ul className="space-y-6">
            {q.data.items.map((d) => (
              <li key={d.id}>
                <Dispute d={d} />
              </li>
            ))}
          </ul>
          <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
