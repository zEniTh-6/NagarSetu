// Repair evidence review (design/stitch/admin/repair-evidence-review): original vs evidence, the
// contractor's GPS vs the issue point, timestamps, the AI repair check (a suggestion), and the
// submission history. Approve → RESOLVED (only the admin can). Reject needs a reason for the contractor.
import { lazy, Suspense, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Camera, Check, CircleX, Images, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AiVerdictChip } from "../../components/AiVerdictChip.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { PhotoCompare } from "../../components/PhotoCompare.jsx";
import { Pill } from "../../components/Pill.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { StatusBadge } from "../../components/StatusBadge.jsx";
import { useToast } from "../../components/Toast.jsx";
import { Ref, When } from "../../components/admin/AdminBits.jsx";
import { ConfirmAction } from "../../components/admin/ConfirmAction.jsx";
import { useCategoryName } from "../../components/citizen/CategoryIcon.jsx";
import { adminApi } from "../../api/admin.js";
import { errorText } from "../../lib/errors.js";
import { formatDateTime, formatDistance } from "../../lib/format.js";
import { useAdminIssue, useAfterAction } from "./review/useAdminIssue.js";

const AdminMap = lazy(() => import("../../components/admin/AdminMap.jsx"));
const SUB_STYLE = { SUBMITTED: "bg-warning-tint text-warning", APPROVED: "bg-status-resolved-tint text-status-resolved", REJECTED: "bg-error-tint text-error" };

/** Camera vs gallery, as the contractor app reported it. A signal only, never a rejection (D-027). */
function CaptureSource({ source }) {
  const { t } = useTranslation();
  if (source === "GALLERY") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1 font-semibold text-warning">
        <Images aria-hidden="true" className="size-4" />
        {t("admin.repair.fromGallery")}
        <span className="font-normal text-charcoal-900">· {t("admin.repair.galleryNote")}</span>
      </span>
    );
  }
  if (source === "CAMERA") {
    return (
      <span className="inline-flex items-center gap-1">
        <Camera aria-hidden="true" className="size-4" />
        {t("admin.repair.fromCamera")}
      </span>
    );
  }
  return <span className="text-graphite-600">{t("admin.repair.sourceUnknown")}</span>;
}

export default function RepairReviewPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const toast = useToast();
  const categoryName = useCategoryName();
  const after = useAfterAction(id);
  const { data: issue, isPending, error } = useAdminIssue(id);
  const [open, setOpen] = useState(null);
  const lang = i18n.resolvedLanguage;

  const back = (
    <Link to={`/admin/issues/${id}`} className="mb-3 inline-flex min-h-11 items-center gap-2 text-label text-teal-700">
      <ArrowLeft aria-hidden="true" className="size-5" />
      {t("admin.repair.back")}
    </Link>
  );
  if (isPending) return <Spinner />;
  if (error) {
    return (
      <>
        {back}
        <Card>
          <EmptyState icon={CircleX} title={errorText(t, i18n, error)} />
        </Card>
      </>
    );
  }
  const subs = [...(issue.submissions ?? [])].reverse(); // newest first
  const current = subs.find((s) => s.status === "SUBMITTED") ?? subs[0];
  if (!current) {
    return (
      <>
        {back}
        <Card>
          <EmptyState icon={CircleX} title={t("admin.repair.none")} />
        </Card>
      </>
    );
  }
  const waiting = current.status === "SUBMITTED";
  const d = current.device ?? {};
  const hasDevice = d.lat != null && d.lng != null;
  const contractorName = (cid) => [issue.assignment, ...(issue.pastAssignments ?? [])].find((a) => a?.contractor?.id === cid)?.contractor?.name ?? "—";

  return (
    <>
      {back}
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={issue.status} />
          <Pill className={SUB_STYLE[current.status]}>{t(`admin.repair.status.${current.status}`)}</Pill>
        </div>
        <h1 className="mt-2 text-h1 text-charcoal-900">
          {t("admin.repair.title")} · <Ref id={issue.id} />
        </h1>
        <p className="mt-1 text-caption text-graphite-600">
          {categoryName(issue.category)} · {t("admin.repair.by", { name: contractorName(current.contractorId) })}
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Card>
            <PhotoCompare
              before={issue.photo && { src: issue.photo.url, alt: t("admin.photo.before"), time: formatDateTime(issue.createdAt, lang) }}
              after={current.photo && { src: current.photo.url, alt: t("admin.photo.after"), time: formatDateTime(current.capturedAt ?? current.submittedAt, lang) }}
            />
            <dl className="mt-4 grid gap-2 text-caption text-charcoal-900 sm:grid-cols-2">
              <div>
                <dt className="text-graphite-600">{t("admin.repair.reportedAt")}</dt>
                <dd><When at={issue.createdAt} /></dd>
              </div>
              <div>
                <dt className="text-graphite-600">{t("admin.repair.capturedAt")}</dt>
                <dd>{current.capturedAt ? <When at={current.capturedAt} /> : t("admin.repair.unknown")}</dd>
              </div>
              <div>
                <dt className="text-graphite-600">{t("admin.repair.submittedAt")}</dt>
                <dd><When at={current.submittedAt} /></dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-graphite-600">{t("admin.repair.source")}</dt>
                <dd><CaptureSource source={current.captureSource} /></dd>
              </div>
              {current.note && (
                <div className="sm:col-span-2">
                  <dt className="text-graphite-600">{t("admin.repair.note")}</dt>
                  <dd className="text-body">{current.note}</dd>
                </div>
              )}
            </dl>
            {current.photo?.originalUrl && (
              <a href={current.photo.originalUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-label text-teal-700 underline-offset-4 hover:underline">
                {t("admin.repair.original")}
              </a>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-h3 text-charcoal-900">{t("admin.repair.location")}</h2>
            {issue.location && (
              <Suspense fallback={<div className="h-72 rounded-card bg-ivory-50" />}>
                <AdminMap pin={issue.location} device={hasDevice ? d : null} label={t("admin.repair.location")} pinTitle={t("admin.review.pinned")} />
              </Suspense>
            )}
            <p className="mt-3 text-caption font-semibold text-charcoal-900">
              {hasDevice
                ? t("admin.repair.distance", {
                    distance: formatDistance(d.distanceFromIssueM ?? 0, lang),
                    accuracy: d.accuracyM != null ? formatDistance(d.accuracyM, lang) : "—",
                  })
                : t("admin.repair.noDevice")}
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 text-h3 text-charcoal-900">{t("admin.repair.history")}</h2>
            <ol className="space-y-3">
              {subs.map((s, i) => (
                <li key={s.id} className="flex gap-3 rounded-control border border-stone-300 p-3">
                  {s.photo && <img src={s.photo.url} alt="" className="size-16 shrink-0 rounded-control object-cover" />}
                  <div className="min-w-0 text-caption text-charcoal-900">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{t("admin.repair.attempt", { n: subs.length - i })}</span>
                      <Pill className={SUB_STYLE[s.status]}>{t(`admin.repair.status.${s.status}`)}</Pill>
                    </p>
                    <p className="text-graphite-600">
                      <When at={s.submittedAt} /> · {contractorName(s.contractorId)}
                    </p>
                    {s.captureSource === "GALLERY" && <CaptureSource source="GALLERY" />}
                    {s.review?.reason && <p className="mt-1">{t("admin.repair.reviewReason", { reason: s.review.reason })}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="repair-ai" className="rounded-card border border-dashed border-teal-700 bg-sage-100/40 p-4 sm:p-6">
            <h2 id="repair-ai" className="text-h3 text-charcoal-900">{t("admin.ai.repairTitle")}</h2>
            <p className="mt-1 text-caption text-charcoal-900">{t("admin.ai.note")}</p>
            <div className="mt-3">
              {current.ai?.verdict ? (
                <>
                  <AiVerdictChip verdict={current.ai.verdict} />
                  {current.ai.reason && <p className="mt-2 text-body text-charcoal-900">{current.ai.reason}</p>}
                </>
              ) : (
                <p className="text-body text-charcoal-900">{t("admin.ai.pending")}</p>
              )}
            </div>
          </section>
          <Card variant="highlight">
            <h2 className="mb-3 text-h3 text-charcoal-900">{t("admin.review.decide")}</h2>
            {waiting ? (
              <div className="space-y-2">
                <Button fullWidth leftIcon={Check} onClick={() => setOpen("approve")}>
                  {t("admin.repair.approve")}
                </Button>
                <Button fullWidth variant="destructive-outline" leftIcon={X} onClick={() => setOpen("reject")}>
                  {t("admin.repair.reject")}
                </Button>
                <p className="text-caption text-charcoal-900">{t("admin.repair.pausedNote")}</p>
              </div>
            ) : (
              <p className="text-body text-charcoal-900">{t("admin.repair.reviewed")}</p>
            )}
          </Card>
        </aside>
      </div>

      <ConfirmAction
        open={open === "approve"}
        onClose={() => setOpen(null)}
        title={t("admin.repair.approveTitle")}
        description={t("admin.repair.approveBody")}
        confirmLabel={t("admin.repair.approve")}
        reason="optional"
        reasonLabel={t("admin.repair.approveNote")}
        onConfirm={async (note) => {
          const res = await adminApi.approveSubmission(current.id, note ? { note } : {});
          toast.show({ tone: "success", title: t("admin.repair.approved") });
          after(res);
        }}
      />
      <ConfirmAction
        open={open === "reject"}
        onClose={() => setOpen(null)}
        tone="destructive"
        title={t("admin.repair.rejectTitle")}
        description={t("admin.repair.rejectBody")}
        confirmLabel={t("admin.repair.reject")}
        reason="required"
        reasonLabel={t("admin.repair.rejectReason")}
        onConfirm={async (reason) => {
          const res = await adminApi.rejectSubmission(current.id, { reason });
          toast.show({ tone: "success", title: t("admin.repair.rejected") });
          after(res);
        }}
      />
    </>
  );
}
