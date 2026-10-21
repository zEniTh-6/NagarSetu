// Job detail (design/stitch/contractor/job-detail): the citizen's photo, description, exact location
// with "Open in Google Maps", priority, deadline and the department's note. "Start work" is
// confirmed. There is no resolve button: only an admin approving the evidence resolves an issue.
import { lazy, Suspense, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, Camera, CircleX, ExternalLink, History, MapPin, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { PriorityPill } from "../../components/PriorityPill.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { useToast } from "../../components/Toast.jsx";
import { ConfirmAction } from "../../components/admin/ConfirmAction.jsx";
import { CategoryTile, useCategoryName } from "../../components/citizen/CategoryIcon.jsx";
import { DeadlineCountdown, StageLabel, areaOf } from "../../components/contractor/JobBits.jsx";
import { contractorApi, ck } from "../../api/contractor.js";
import { ApiError } from "../../api/client.js";
import { errorText } from "../../lib/errors.js";
import { formatCoords, formatDateTime, shortRef } from "../../lib/format.js";

const PinMap = lazy(() => import("../../components/citizen/PinMap.jsx"));

export const mapsUrl = ({ lat, lng }) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export function useJob(id) {
  return useQuery({ queryKey: ck.job(id), queryFn: () => contractorApi.job(id).then((r) => r.job), retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2 });
}

/** 404: not assigned to this contractor (any more), or doesn't exist. Never says which. */
export function JobMissing({ error, back = "/contractor" }) {
  const { t, i18n } = useTranslation();
  const missing = error instanceof ApiError && error.status === 404;
  return (
    <Card>
      <EmptyState
        icon={CircleX}
        title={missing ? t("contractor.job.notYours") : errorText(t, i18n, error)}
        message={missing ? t("contractor.job.notYoursBody") : undefined}
        action={<Button to={back}>{t("contractor.nav.jobs")}</Button>}
      />
    </Card>
  );
}

export default function JobDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const categoryName = useCategoryName();
  const { data: job, isPending, error } = useJob(id);
  const [confirm, setConfirm] = useState(false);
  const lang = i18n.resolvedLanguage;

  const back = (
    <button type="button" onClick={() => navigate(-1)} className="tap -ms-2 mb-3 inline-flex items-center gap-2 rounded-control px-2 text-label text-forest-900">
      <ArrowLeft aria-hidden="true" className="size-5" />
      {t("common.back")}
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

  const canSubmit = job.stage === "IN_PROGRESS" || job.stage === "REWORK";
  const lastRejected = job.stage === "REWORK" ? job.submissions.at(-1) : null;

  return (
    <div className="mx-auto max-w-3xl">
      {back}
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <StageLabel stage={job.stage} />
          {job.priority && <PriorityPill level={job.priority} />}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <CategoryTile categoryKey={job.category.key} size="lg" />
          <div>
            <h1 className="text-h1 text-charcoal-900">{categoryName(job.category)}</h1>
            <p className="tnum text-caption text-graphite-600">
              {shortRef(job.issueId)} · {t("contractor.job.assignedOn", { date: formatDateTime(job.assignedAt, lang) })}
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-4">
        {lastRejected && (
          <Alert tone="error" title={t("contractor.stage.REWORK")}>
            {lastRejected.reviewReason}
          </Alert>
        )}
        {job.stage === "SUBMITTED" && <Alert tone="info" title={t("contractor.job.waiting")}>{t("contractor.job.waitingBody")}</Alert>}

        <Card>
          <DeadlineCountdown deadline={job.deadline} done={job.stage === "COMPLETED"} className="text-body" />
          {job.department && (
            <p className="mt-2 flex items-center gap-2 text-caption text-charcoal-900">
              <Building2 aria-hidden="true" className="size-4 shrink-0" />
              {t("contractor.job.assignedBy", { department: job.department.name })}
            </p>
          )}
          {job.note && (
            <div className="mt-3 rounded-control border border-teal-700/30 bg-sage-100 p-3">
              <p className="text-eyebrow uppercase text-forest-900">{t("contractor.job.note")}</p>
              {/* The admin's words, as written. */}
              <p className="mt-1 whitespace-pre-wrap text-body text-charcoal-900">{job.note}</p>
            </div>
          )}
        </Card>

        {job.photo && <img src={job.photo.url} alt={t("contractor.job.photoAlt")} className="aspect-[4/3] w-full rounded-card border border-stone-300 bg-white object-cover" />}

        <Card>
          <h2 className="text-eyebrow uppercase text-graphite-600">{t("issue.description")}</h2>
          <p className="mt-2 whitespace-pre-wrap text-body text-charcoal-900">{job.description}</p>
        </Card>

        {job.location && (
          <Card>
            <h2 className="text-eyebrow uppercase text-graphite-600">{t("issue.location")}</h2>
            {areaOf(job) && (
              <p className="mt-2 flex items-start gap-2 text-body text-charcoal-900">
                <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-teal-700" />
                {areaOf(job)}
              </p>
            )}
            <div className="mt-3">
              <Suspense fallback={<div className="h-56 rounded-card bg-ivory-50" />}>
                <PinMap pin={job.location} interactive={false} className="h-56" />
              </Suspense>
            </div>
            <p className="tnum mt-2 text-caption text-graphite-600">{formatCoords(job.location.lat, job.location.lng)}</p>
            <Button variant="outline" className="mt-3" leftIcon={ExternalLink} href={mapsUrl(job.location)} target="_blank" rel="noreferrer">
              {t("contractor.job.openMaps")}
            </Button>
          </Card>
        )}

        <div className="space-y-3">
          {job.stage === "NEW" && (
            <Button fullWidth leftIcon={Play} onClick={() => setConfirm(true)}>
              {t("contractor.job.start")}
            </Button>
          )}
          {canSubmit && (
            <Button fullWidth leftIcon={Camera} to={`/contractor/jobs/${job.issueId}/evidence`}>
              {job.stage === "REWORK" ? t("contractor.evidence.submitNew") : t("contractor.job.submitEvidence")}
            </Button>
          )}
          {job.submissions.length > 0 && (
            <Button fullWidth variant="outline" leftIcon={History} to={`/contractor/jobs/${job.issueId}/submissions`}>
              {t("contractor.job.submissions", { count: job.submissions.length })}
            </Button>
          )}
          <p className="text-center text-caption text-graphite-600">{t("contractor.job.noResolve")}</p>
        </div>
        <p className="pt-2 text-center">
          <Link to="/contractor" className="text-label text-teal-700 underline-offset-4 hover:underline">
            {t("contractor.nav.jobs")}
          </Link>
        </p>
      </div>

      <ConfirmAction
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("contractor.job.startTitle")}
        description={t("contractor.job.startBody")}
        confirmLabel={t("contractor.job.start")}
        onConfirm={async () => {
          const res = await contractorApi.start(job.issueId);
          qc.setQueryData(ck.job(job.issueId), res.job);
          qc.invalidateQueries({ queryKey: ck.jobs });
          toast.show({ tone: "success", title: t("contractor.job.started") });
        }}
      />
    </div>
  );
}
