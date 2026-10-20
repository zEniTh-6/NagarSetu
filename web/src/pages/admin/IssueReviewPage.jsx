// Issue review (design/stitch/admin/issue-review). Everything an admin needs to decide, with AI
// results clearly labelled as suggestions. Not copied from Stitch: voice-to-text, "cryptographic"
// wording, official-portal branding.
import { lazy, Suspense, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, ArrowRight, Bot, CircleX, ExternalLink, FileSearch, Link2, MapPin, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { AiVerdictChip } from "../../components/AiVerdictChip.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { FlagChip } from "../../components/FlagChip.jsx";
import { PriorityPill } from "../../components/PriorityPill.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { StatusBadge } from "../../components/StatusBadge.jsx";
import { useToast } from "../../components/Toast.jsx";
import { AiRisk, CommunitySignal, DeadlineCell, Ref, When } from "../../components/admin/AdminBits.jsx";
import { ConfirmAction } from "../../components/admin/ConfirmAction.jsx";
import { useCategoryName } from "../../components/citizen/CategoryIcon.jsx";
import { adminApi } from "../../api/admin.js";
import { ApiError } from "../../api/client.js";
import { errorText } from "../../lib/errors.js";
import { formatDistance } from "../../lib/format.js";
import { DecisionActions } from "./review/DecisionActions.jsx";
import { WorkActions } from "./review/WorkActions.jsx";
import { CommentsPanel } from "./review/CommentsPanel.jsx";
import { useAdminIssue, useAfterAction } from "./review/useAdminIssue.js";

const AdminMap = lazy(() => import("../../components/admin/AdminMap.jsx"));
const REVIEWABLE = ["SUSPICIOUS", "POSSIBLE_DUPLICATE", "PENDING_REVIEW"];

function Panel({ title, icon: Icon, children, className }) {
  return (
    <Card className={className}>
      <h2 className="mb-3 flex items-center gap-2 text-h3 text-charcoal-900">
        {Icon && <Icon aria-hidden="true" className="size-5 text-teal-700" />}
        {title}
      </h2>
      {children}
    </Card>
  );
}

/** The pinned point vs the citizen's device GPS (a signal, never proof of fraud). */
function LocationPanel({ issue }) {
  const { t, i18n } = useTranslation();
  const d = issue.device ?? {};
  const hasDevice = d.lat != null && d.lng != null;
  return (
    <Panel title={t("admin.review.location")} icon={MapPin}>
      {issue.addressText && <p className="mb-2 text-body text-charcoal-900">{issue.addressText}</p>}
      {issue.location && (
        <Suspense fallback={<div className="h-72 rounded-card bg-ivory-50" />}>
          <AdminMap pin={issue.location} device={hasDevice ? d : null} label={t("admin.review.location")} pinTitle={t("admin.review.pinned")} />
        </Suspense>
      )}
      <ul className="mt-3 space-y-1 text-caption text-charcoal-900">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block size-3 rounded-full bg-[#2A81CB]" />
          {t("admin.review.pinned")}
        </li>
        {hasDevice ? (
          <>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block size-3 rounded-full bg-error" />
              {t("admin.review.deviceGps", { accuracy: d.accuracyM != null ? formatDistance(d.accuracyM, i18n.resolvedLanguage) : "—" })}
            </li>
            <li className="font-semibold">{t("admin.review.distance", { distance: formatDistance(d.distanceFromPinM ?? 0, i18n.resolvedLanguage) })}</li>
          </>
        ) : (
          <li className="text-graphite-600">{t("admin.review.noDevice")}</li>
        )}
      </ul>
    </Panel>
  );
}

function AiPanel({ issue }) {
  const { t } = useTranslation();
  const categoryName = useCategoryName();
  const ai = issue.ai ?? {};
  return (
    <section aria-labelledby="ai-title" className="rounded-card border border-dashed border-teal-700 bg-sage-100/40 p-4 sm:p-6">
      <h2 id="ai-title" className="flex items-center gap-2 text-h3 text-charcoal-900">
        <Bot aria-hidden="true" className="size-5 text-teal-700" />
        {t("admin.ai.title")}
      </h2>
      <p className="mt-1 text-caption text-charcoal-900">{t("admin.ai.note")}</p>
      {!ai.verdict ? (
        <p className="mt-3 text-body text-charcoal-900">{ai.attempts ? t("admin.ai.pendingRetry", { count: ai.attempts }) : t("admin.ai.pending")}</p>
      ) : (
        <dl className="mt-3 space-y-3 text-body">
          <div>
            <dt className="text-eyebrow uppercase text-charcoal-900">{t("admin.ai.photo")}</dt>
            <dd className="mt-1">
              <AiVerdictChip verdict={ai.verdict} />
              {ai.reason && <p className="mt-1 text-charcoal-900">{ai.reason}</p>}
            </dd>
          </div>
          <div>
            <dt className="text-eyebrow uppercase text-charcoal-900">{t("admin.ai.risk")}</dt>
            <dd className="mt-1">
              <AiRisk level={ai.riskLevel} />
              {ai.riskReason && <p className="mt-1 text-charcoal-900">{ai.riskReason}</p>}
            </dd>
          </div>
          {ai.suggestedCategory && ai.suggestedCategory !== issue.category.key && (
            <div>
              <dt className="text-eyebrow uppercase text-charcoal-900">{t("admin.ai.category")}</dt>
              <dd className="mt-1 text-charcoal-900">{categoryName({ key: ai.suggestedCategory })}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

function FlagsPanel({ issue }) {
  const { t } = useTranslation();
  const toast = useToast();
  const after = useAfterAction(issue.id);
  const [action, setAction] = useState(null); // { flag, kind: "clear" | "confirm" }
  if (!issue.flags?.length) return null;
  return (
    <Panel title={t("admin.review.flags")}>
      <p className="mb-3 text-caption text-graphite-600">{t("admin.review.flagsNote")}</p>
      <ul className="space-y-3">
        {issue.flags.map((f) => (
          <li key={f.id} className="rounded-control border border-stone-300 p-3">
            <FlagChip flag={f.type} />
            {f.reason && <p className="mt-2 break-words text-caption text-charcoal-900">{f.reason}</p>}
            {f.confirmed && <p className="mt-1 text-caption font-semibold text-charcoal-900">{t("admin.review.flagConfirmed", { reason: f.confirmed.reason })}</p>}
            {REVIEWABLE.includes(f.type) && !f.confirmed && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setAction({ flag: f, kind: "clear" })}>
                  {t("admin.review.clearFlag")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAction({ flag: f, kind: "confirm" })}>
                  {t("admin.review.confirmFlag")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <ConfirmAction
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={action ? t(`admin.review.${action.kind}FlagTitle`, { flag: t(`flag.${action.flag.type}`) }) : ""}
        description={action ? t(`admin.review.${action.kind}FlagBody`) : ""}
        confirmLabel={action ? t(`admin.review.${action.kind}Flag`) : ""}
        reason="required"
        onConfirm={async (reason) => {
          const fn = action.kind === "clear" ? adminApi.clearFlag : adminApi.confirmFlag;
          const res = await fn(issue.id, action.flag.id, { reason });
          toast.show({ tone: "success", title: t(`admin.review.done.${action.kind}Flag`) });
          after(res);
        }}
      />
    </Panel>
  );
}

function DuplicatesPanel({ issue }) {
  const { t } = useTranslation();
  const toast = useToast();
  const after = useAfterAction(issue.id);
  const [target, setTarget] = useState(null);
  const categoryName = useCategoryName();
  const list = issue.possibleDuplicates ?? [];
  if (!list.length && !issue.duplicateOf && !issue.linkedDuplicates?.length) return null;
  return (
    <Panel title={t("admin.review.duplicates")} icon={Link2}>
      {issue.duplicateOf && (
        <p className="mb-2 text-caption text-charcoal-900">
          {t("admin.review.linkedTo")} <Link className="text-teal-700 underline" to={`/admin/issues/${issue.duplicateOf.id}`}><Ref id={issue.duplicateOf.id} /></Link>
        </p>
      )}
      {issue.linkedDuplicates?.length > 0 && (
        <p className="mb-2 text-caption text-charcoal-900">{t("admin.review.linkedHere", { count: issue.linkedDuplicates.length })}</p>
      )}
      <ul className="space-y-2">
        {list.map((d) => (
          <li key={d.id} className="rounded-control border border-stone-300 p-3">
            <p className="text-caption text-graphite-600">
              <Link className="text-teal-700 underline" to={`/admin/issues/${d.id}`}>
                <Ref id={d.id} />
              </Link>{" "}
              · {categoryName({ key: d.category })} · {d.distanceM != null && t("admin.review.away", { distance: d.distanceM })}
            </p>
            <p className="mt-1 line-clamp-2 text-body text-charcoal-900">{d.description}</p>
            {issue.status === "REPORTED" && (
              <Button size="sm" variant="outline" className="mt-2" leftIcon={Link2} onClick={() => setTarget(d)}>
                {t("admin.review.linkThis")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmAction
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={t("admin.review.linkTitle")}
        description={target ? t("admin.review.linkToBody", { ref: `#${target.id.slice(0, 8).toUpperCase()}` }) : ""}
        confirmLabel={t("admin.review.link")}
        reason="optional"
        reasonLabel={t("admin.review.reasonForCitizen")}
        onConfirm={async (reason) => {
          const res = await adminApi.linkDuplicate(issue.id, { targetIssueId: target.id, ...(reason ? { reason } : {}) });
          toast.show({ tone: "success", title: t("admin.review.done.link") });
          after(res);
        }}
      />
    </Panel>
  );
}

function WorkPanel({ issue }) {
  const { t } = useTranslation();
  const a = issue.assignment;
  const waiting = issue.submissions?.some((s) => s.status === "SUBMITTED");
  return (
    <Panel title={t("admin.review.work")}>
      {a ? (
        <dl className="space-y-1 text-caption text-charcoal-900">
          <div className="flex justify-between gap-3">
            <dt>{t("admin.review.contractor")}</dt>
            <dd className="font-semibold">
              {a.contractor.name}
              {a.contractor.status !== "ACTIVE" && <span className="ms-1 text-error">({t("admin.contractors.status.DEACTIVATED")})</span>}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>{t("admin.review.deadline")}</dt>
            <dd>
              <DeadlineCell assignment={{ deadline: a.deadline, overdue: !a.deadline.paused && new Date(a.deadline.effectiveDeadline) < new Date() }} />
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>{t("admin.review.started")}</dt>
            <dd>{a.startedAt ? <When at={a.startedAt} /> : t("admin.review.notStarted")}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-caption text-graphite-600">{t("admin.review.notAssigned")}</p>
      )}
      {issue.submissions?.length > 0 && (
        <Button size="sm" variant={waiting ? "primary" : "outline"} className="mt-3" leftIcon={FileSearch} to={`/admin/issues/${issue.id}/repair`}>
          {waiting ? t("admin.review.verifyEvidence") : t("admin.review.repairHistory", { count: issue.submissions.length })}
        </Button>
      )}
    </Panel>
  );
}

function FeedbackPanel({ issue }) {
  const { t } = useTranslation();
  const fb = issue.feedback;
  if (!fb?.responses?.length && !fb?.current) return null;
  return (
    <Panel title={t("admin.review.feedback")}>
      {fb.current && (
        <p className="tnum text-caption text-charcoal-900">
          {t("admin.review.feedbackCounts", { fixed: fb.current.fixed, notFixed: fb.current.notFixed, none: fb.current.noResponse })}
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {fb.responses
          .filter((r) => r.verdict === "NOT_FIXED")
          .map((r) => (
            <li key={r.id} className="rounded-control border border-stone-300 p-3 text-caption text-charcoal-900">
              <p className="font-semibold">
                {r.by.name} · <When at={r.at} />
              </p>
              <p className="mt-1 text-body">{r.reason}</p>
              {r.photo && <img src={r.photo.url} alt={t("admin.review.feedbackPhoto")} className="mt-2 max-h-48 rounded-control border border-stone-300" />}
            </li>
          ))}
      </ul>
    </Panel>
  );
}

function HistoryPanel({ issue }) {
  const { t } = useTranslation();
  return (
    <Panel title={t("admin.review.history")}>
      <ol className="space-y-2">
        {(issue.history ?? []).map((h, i) => (
          <li key={i} className="border-s-2 border-stone-300 ps-3 text-caption text-charcoal-900">
            <p className="font-semibold">{t(`admin.audit.action.${h.action}`, { defaultValue: h.action })}</p>
            <p className="text-graphite-600">
              <When at={h.at} /> · {h.by ? `${h.by.name} (${t(`role.${h.by.role}`)})` : t("admin.audit.system")}
            </p>
            {h.reason && <p className="mt-0.5 break-words">{h.reason}</p>}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export default function IssueReviewPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const categoryName = useCategoryName();
  const { data: issue, isPending, error, refetch } = useAdminIssue(id);

  const back = (
    <Link to="/admin/issues" className="mb-3 inline-flex min-h-11 items-center gap-2 text-label text-teal-700">
      <ArrowLeft aria-hidden="true" className="size-5" />
      {t("admin.review.back")}
    </Link>
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
            title={missing ? t("admin.review.notFound") : errorText(t, i18n, error)}
            message={missing ? t("admin.review.notFoundBody") : undefined}
            action={!missing && <Button onClick={() => refetch()}>{t("common.retry")}</Button>}
          />
        </Card>
      </>
    );
  }

  const closedNote =
    issue.status === "REJECTED" || issue.status === "DUPLICATE" || issue.status === "WITHDRAWN"
      ? t(`admin.review.closed.${issue.status === "REJECTED" && issue.rejectionType === "NOT_OUR_JURISDICTION" ? "FORWARDED" : issue.status}`)
      : null;

  return (
    <>
      {back}
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={issue.status} rejectionType={issue.rejectionType} />
          {issue.priority && <PriorityPill level={issue.priority} />}
          {issue.flags.map((f) => (
            <FlagChip key={f.id} flag={f.type} />
          ))}
        </div>
        <h1 className="mt-2 text-h1 text-charcoal-900">
          <Ref id={issue.id} /> · {categoryName(issue.category)}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-caption text-graphite-600">
          <span>
            {t("admin.review.reportedAt")} <When at={issue.createdAt} />
          </span>
          {issue.reporter && (
            <span className="inline-flex items-center gap-1">
              <User aria-hidden="true" className="size-4" />
              {issue.reporter.name}
            </span>
          )}
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Card>
            {issue.photo ? (
              <figure className="m-0">
                <img src={issue.photo.url} alt={t("admin.review.photoAlt")} className="max-h-[28rem] w-full rounded-control border border-stone-300 bg-ivory-50 object-contain" />
                {issue.photoOriginalUrl && (
                  <a href={issue.photoOriginalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-label text-teal-700 underline-offset-4 hover:underline">
                    <ExternalLink aria-hidden="true" className="size-4" />
                    {t("admin.review.original")}
                  </a>
                )}
              </figure>
            ) : (
              <p className="text-caption text-graphite-600">{t("admin.review.noPhoto")}</p>
            )}
            <h2 className="mt-5 text-eyebrow uppercase text-graphite-600">{t("admin.review.description")}</h2>
            {/* Stored and shown exactly as the citizen wrote it (any language or script). */}
            <p className="mt-1 whitespace-pre-wrap text-body text-charcoal-900">{issue.description}</p>
            {issue.statusReason && (
              <p className="mt-3 text-caption text-charcoal-900">
                <span className="font-semibold">{t("admin.review.statusReason")}:</span> {issue.statusReason}
              </p>
            )}
          </Card>
          <LocationPanel issue={issue} />
          <Panel title={t("admin.review.community")}>
            <CommunitySignal community={issue.community} />
            <p className="mt-2 text-caption text-graphite-600">{t("admin.review.communityNote")}</p>
          </Panel>
          {["ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"].includes(issue.status) && <WorkPanel issue={issue} />}
          <FeedbackPanel issue={issue} />
          <CommentsPanel issueId={issue.id} />
          <HistoryPanel issue={issue} />
        </div>

        <aside className="space-y-6">
          <Card variant="highlight">
            <h2 className="mb-3 text-h3 text-charcoal-900">{t("admin.review.decide")}</h2>
            {closedNote ? (
              <p className="text-body text-charcoal-900">{closedNote}</p>
            ) : issue.status === "REPORTED" ? (
              <DecisionActions issue={issue} />
            ) : (
              <WorkActions issue={issue} />
            )}
          </Card>
          <AiPanel issue={issue} />
          <FlagsPanel issue={issue} />
          <DuplicatesPanel issue={issue} />
          {issue.submissions?.some((s) => s.status === "SUBMITTED") && (
            <Alert tone="warning" title={t("admin.review.evidenceWaiting")} action={<Button size="sm" to={`/admin/issues/${issue.id}/repair`} rightIcon={ArrowRight}>{t("admin.review.verifyEvidence")}</Button>} />
          )}
        </aside>
      </div>
    </>
  );
}
