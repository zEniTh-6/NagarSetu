// Submission status (design/stitch/contractor/submission-status): the latest evidence (Waiting /
// Approved / Rework requested with the admin's reason) and the full history. Not copied from Stitch:
// SMS receipts, "auto-dispatch".
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Camera, CircleCheck, Clock, Images, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { Pill } from "../../components/Pill.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { formatDateTime, shortRef } from "../../lib/format.js";
import { cx } from "../../lib/cx.js";
import { JobMissing, useJob } from "./JobDetailPage.jsx";

const STYLE = {
  SUBMITTED: { icon: Clock, className: "bg-warning-tint text-warning" },
  APPROVED: { icon: CircleCheck, className: "bg-status-resolved-tint text-status-resolved" },
  REJECTED: { icon: RotateCcw, className: "bg-error-tint text-error" },
};

export function SubmissionPill({ status }) {
  const { t } = useTranslation();
  const s = STYLE[status];
  return (
    <Pill icon={s.icon} className={s.className}>
      {t(`contractor.submission.${status}`)}
    </Pill>
  );
}

export default function SubmissionsPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: job, isPending, error } = useJob(id);
  const lang = i18n.resolvedLanguage;

  const back = (
    <button type="button" onClick={() => navigate(`/contractor/jobs/${id}`)} className="tap -ms-2 mb-3 inline-flex items-center gap-2 rounded-control px-2 text-label text-forest-900">
      <ArrowLeft aria-hidden="true" className="size-5" />
      {t("contractor.submission.backToJob")}
    </button>
  );
  if (isPending) {
    return (
      <div className="flex justify-center py-16 text-teal-700">
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <>
        {back}
        <JobMissing error={error} />
      </>
    );
  }
  const subs = [...job.submissions].reverse(); // newest first
  const latest = subs[0];

  return (
    <div className="mx-auto max-w-3xl">
      {back}
      <h1 className="text-h1 text-charcoal-900">{t("contractor.submission.title")}</h1>
      <p className="tnum mt-1 text-caption text-graphite-600">{shortRef(job.issueId)}</p>

      {!latest ? (
        <Card className="mt-5">
          <p className="text-body text-charcoal-900">{t("contractor.submission.none")}</p>
        </Card>
      ) : (
        <Card className="mt-5">
          <SubmissionPill status={latest.status} />
          <p className="mt-2 text-body text-charcoal-900">{t(`contractor.submission.explain.${latest.status}`)}</p>
          {latest.status === "REJECTED" && latest.reviewReason && (
            <Alert tone="error" className="mt-3" title={t("contractor.submission.adminReason")}>
              {latest.reviewReason}
            </Alert>
          )}
          {latest.photo && <img src={latest.photo.url} alt={t("contractor.submission.photoAlt")} className="mt-3 aspect-[4/3] w-full rounded-control border border-stone-300 object-cover" />}
          {job.stage === "REWORK" && (
            <Button fullWidth className="mt-4" leftIcon={Camera} to={`/contractor/jobs/${id}/evidence`}>
              {t("contractor.evidence.submitNew")}
            </Button>
          )}
        </Card>
      )}

      {subs.length > 0 && (
        <section aria-labelledby="history" className="mt-6">
          <h2 id="history" className="mb-3 text-h2 text-charcoal-900">
            {t("contractor.submission.history")}
          </h2>
          <ol className="space-y-3">
            {subs.map((s, i) => (
              <li key={s.id} className={cx("flex gap-3 rounded-card border border-stone-300 bg-white p-3", i === 0 && "border-teal-700/40")}>
                {s.photo && <img src={s.photo.url} alt="" className="size-20 shrink-0 rounded-control object-cover" />}
                <div className="min-w-0 text-caption text-charcoal-900">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{t("contractor.submission.attempt", { n: subs.length - i })}</span>
                    <SubmissionPill status={s.status} />
                  </p>
                  <p className="tnum mt-1 text-graphite-600">{t("contractor.submission.sentAt", { when: formatDateTime(s.submittedAt, lang) })}</p>
                  {s.captureSource === "GALLERY" && (
                    <p className="mt-0.5 flex items-center gap-1 text-graphite-600">
                      <Images aria-hidden="true" className="size-3.5" />
                      {t("contractor.evidence.fromGallery")}
                    </p>
                  )}
                  {s.note && <p className="mt-1">{s.note}</p>}
                  {s.reviewReason && <p className="mt-1 font-semibold">{t("contractor.submission.reason", { reason: s.reviewReason })}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
