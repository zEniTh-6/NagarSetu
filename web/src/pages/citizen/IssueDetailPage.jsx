import { lazy, Suspense, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, CircleCheck, CircleX, Link2, MapPin, ThumbsDown, ThumbsUp, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { Modal } from "../../components/Modal.jsx";
import { PhotoCompare } from "../../components/PhotoCompare.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { StatusBadge } from "../../components/StatusBadge.jsx";
import { Textarea } from "../../components/Textarea.jsx";
import { useToast } from "../../components/Toast.jsx";
import { CategoryTile, useCategoryName } from "../../components/citizen/CategoryIcon.jsx";
import { IssueTimeline } from "../../components/citizen/IssueTimeline.jsx";
import { CategorySuggestion, ValidationNotice } from "../../components/citizen/ValidationNotice.jsx";
import { useIssue } from "../../components/citizen/useIssue.js";
import { issuesApi, qk } from "../../api/citizen.js";
import { ApiError } from "../../api/client.js";
import { errorText } from "../../lib/errors.js";
import { formatCoords, formatDate, formatDateTime, shortRef } from "../../lib/format.js";

const PinMap = lazy(() => import("../../components/citizen/PinMap.jsx"));

/** Rejected / forwarded / linked duplicate / withdrawn: the citizen is always told why. */
function ClosedNotice({ issue }) {
  const { t } = useTranslation();
  if (issue.status === "REJECTED") {
    const forwarded = issue.rejectionType === "NOT_OUR_JURISDICTION";
    return (
      <Alert tone={forwarded ? "info" : "error"} title={t(forwarded ? "closed.forwardedTitle" : "closed.rejectedTitle")}>
        <p>{t(forwarded ? "closed.forwardedBody" : "closed.rejectedBody")}</p>
        {issue.statusReason && (
          <blockquote className="mt-2 border-s-2 border-current/30 ps-3 text-charcoal-900">
            <span className="font-semibold">{t("closed.reason")}:</span> {issue.statusReason}
          </blockquote>
        )}
      </Alert>
    );
  }
  if (issue.status === "DUPLICATE") {
    return (
      <Alert
        tone="info"
        title={t("closed.duplicateTitle")}
        action={
          issue.duplicateOfId && (
            <Button size="sm" variant="outline" leftIcon={Link2} to={`/citizen/issues/${issue.duplicateOfId}`}>
              {t("closed.openMain")}
            </Button>
          )
        }
      >
        <p>{t("closed.duplicateBody")}</p>
        {issue.statusReason && <p className="mt-1">{issue.statusReason}</p>}
      </Alert>
    );
  }
  if (issue.status === "WITHDRAWN") {
    return (
      <Alert tone="info" title={t("closed.withdrawnTitle")}>
        {issue.statusReason && <p>{issue.statusReason}</p>}
      </Alert>
    );
  }
  return null;
}

/** RESOLVED: before/after and "Yes, fixed / Not fixed" (a signal, never a reopen). */
function Resolution({ issue }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const lang = i18n.resolvedLanguage;
  const fb = issue.feedback;

  const fixed = async () => {
    setBusy(true);
    setError(null);
    try {
      await issuesApi.feedback(issue.id, { verdict: "FIXED" });
      toast.show({ tone: "success", title: t("feedback.thanks") });
      qc.invalidateQueries({ queryKey: qk.issue(issue.id) });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="resolution" className="space-y-4">
      <h2 id="resolution" className="text-h2 text-charcoal-900">
        {t("resolution.title")}
      </h2>
      <PhotoCompare
        before={issue.photo && { src: issue.photo.url, alt: t("resolution.beforeAlt"), time: formatDateTime(issue.createdAt, lang) }}
        after={issue.resolution?.photo && { src: issue.resolution.photo.url, alt: t("resolution.afterAlt"), time: formatDateTime(issue.resolution.resolvedAt, lang) }}
      />
      {fb?.myResponse ? (
        <Alert tone={fb.myResponse.verdict === "FIXED" ? "success" : "warning"} title={t(`feedback.my.${fb.myResponse.verdict}`)}>
          {fb.myResponse.reason && <p>{fb.myResponse.reason}</p>}
          {fb.myResponse.verdict === "NOT_FIXED" && <p className="mt-1">{t("feedback.disputedNote")}</p>}
        </Alert>
      ) : fb?.canRespond ? (
        <Card variant="highlight">
          <h3 className="text-h3 text-charcoal-900">{t("feedback.question")}</h3>
          <p className="mt-1 text-body text-graphite-600">{t("feedback.explain")}</p>
          {error && <Alert tone="error" className="mt-3" title={errorText(t, i18n, error)} />}
          <div className="mt-4 grid gap-3">
            <Button leftIcon={ThumbsUp} loading={busy} onClick={fixed}>
              {t("feedback.yes")}
            </Button>
            <Button variant="secondary" leftIcon={ThumbsDown} disabled={busy} to={`/citizen/issues/${issue.id}/not-fixed`}>
              {t("feedback.no")}
            </Button>
          </div>
          <p className="mt-3 flex items-center gap-2 text-caption text-graphite-600">
            <CalendarClock aria-hidden="true" className="size-4" />
            {t("feedback.window", { date: formatDate(fb.windowEndsAt, lang) })}
          </p>
        </Card>
      ) : (
        fb && <p className="text-caption text-graphite-600">{t("feedback.closed")}</p>
      )}
    </section>
  );
}

function WithdrawButton({ issue }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await issuesApi.withdraw(issue.id, reason.trim() || undefined);
      qc.invalidateQueries({ queryKey: qk.issue(issue.id) });
      qc.invalidateQueries({ queryKey: qk.mine });
      toast.show({ tone: "success", title: t("withdraw.done") });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "CANNOT_WITHDRAW" ? t("errors.CANNOT_WITHDRAW") : errorText(t, i18n, err));
      qc.invalidateQueries({ queryKey: qk.issue(issue.id) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="destructive-outline" leftIcon={Undo2} onClick={() => setOpen(true)}>
        {t("withdraw.action")}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("withdraw.title")}
        description={t("withdraw.body")}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" loading={busy} onClick={confirm}>
              {t("withdraw.confirm")}
            </Button>
          </>
        }
      >
        {error && <Alert tone="error" className="mb-4" title={error} />}
        <Textarea label={t("withdraw.reason")} optional rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </>
  );
}

export default function IssueDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const categoryName = useCategoryName();
  const { data: issue, isPending, error, refetch } = useIssue(id);
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
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <>
        {back}
        <Card>
          <EmptyState
            icon={CircleX}
            title={missing ? t("issue.notFound") : errorText(t, i18n, error)}
            message={missing ? t("issue.notFoundBody") : undefined}
            action={missing ? <Button to="/citizen/complaints">{t("nav.complaints")}</Button> : <Button onClick={() => refetch()}>{t("common.retry")}</Button>}
          />
        </Card>
      </>
    );
  }

  const resolved = issue.status === "RESOLVED";
  return (
    <div className="mx-auto max-w-3xl">
      {back}
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={issue.status} rejectionType={issue.rejectionType} />
          {issue.relation === "SUPPORTER" && (
            <span className="rounded-full bg-sage-100 px-2.5 py-0.5 text-caption font-semibold text-sage-600">{t("issue.supporting")}</span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <CategoryTile categoryKey={issue.category.key} size="lg" />
          <div>
            <h1 className="text-h1 text-charcoal-900">{categoryName(issue.category)}</h1>
            <p className="tnum text-caption text-graphite-600">
              {shortRef(issue.id)} · {t("issue.reportedOn", { date: formatDateTime(issue.createdAt, lang) })}
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-4">
        <ValidationNotice issue={issue} />
        <CategorySuggestion issue={issue} />
        <ClosedNotice issue={issue} />

        {resolved ? (
          <Resolution issue={issue} />
        ) : (
          issue.photo && <img src={issue.photo.url} alt={t("issue.photoAlt")} className="aspect-[4/3] w-full rounded-card border border-stone-300 object-cover" />
        )}

        <Card>
          <h2 className="text-eyebrow uppercase text-graphite-600">{t("issue.description")}</h2>
          {/* Stored and shown exactly as the citizen wrote it. */}
          <p className="mt-2 whitespace-pre-wrap text-body text-charcoal-900">{issue.description}</p>
        </Card>

        {issue.location && (
          <Card>
            <h2 className="text-eyebrow uppercase text-graphite-600">{t("issue.location")}</h2>
            {issue.addressText && (
              <p className="mt-2 flex items-start gap-2 text-body text-charcoal-900">
                <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-teal-700" />
                {issue.addressText}
              </p>
            )}
            <div className="mt-3">
              <Suspense fallback={<div className="h-48 rounded-card bg-ivory-50" />}>
                <PinMap pin={issue.location} interactive={false} className="h-48" />
              </Suspense>
            </div>
            <p className="tnum mt-2 text-caption text-graphite-600">{formatCoords(issue.location.lat, issue.location.lng)}</p>
          </Card>
        )}

        <Card>
          <h2 className="mb-4 text-eyebrow uppercase text-graphite-600">{t("issue.timeline")}</h2>
          <IssueTimeline issue={issue} />
        </Card>

        {issue.relation === "REPORTER" && issue.status === "REPORTED" && (
          <Card variant="muted">
            <p className="mb-3 text-caption text-graphite-600">{t("withdraw.hint")}</p>
            <WithdrawButton issue={issue} />
          </Card>
        )}
        {issue.status === "RESOLVED" && !issue.resolution?.photo && (
          <p className="flex items-center gap-2 text-caption text-graphite-600">
            <CircleCheck aria-hidden="true" className="size-4 text-success" />
            {t("resolution.noPhoto")}
          </p>
        )}
        <p className="pt-2 text-center">
          <Link to="/citizen/complaints" className="text-label text-teal-700 underline-offset-4 hover:underline">
            {t("issue.allComplaints")}
          </Link>
        </p>
      </div>
    </div>
  );
}
