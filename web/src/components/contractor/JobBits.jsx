// Small pieces of the contractor app: stage label, deadline countdown, job card.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Building2, Clock, MapPin, Pause, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Pill } from "../Pill.jsx";
import { PriorityPill } from "../PriorityPill.jsx";
import { CategoryTile, useCategoryName } from "../citizen/CategoryIcon.jsx";
import { cx } from "../../lib/cx.js";
import { formatDate } from "../../lib/format.js";

const STAGE_STYLE = {
  NEW: "bg-info-tint text-info",
  IN_PROGRESS: "bg-status-in-progress-tint text-status-in-progress",
  REWORK: "bg-error-tint text-error",
  SUBMITTED: "bg-warning-tint text-warning",
  COMPLETED: "bg-status-resolved-tint text-status-resolved",
};

export function StageLabel({ stage, className }) {
  const { t } = useTranslation();
  return <Pill className={cx(STAGE_STYLE[stage], className)} icon={stage === "REWORK" ? RotateCcw : undefined}>{t(`contractor.stage.${stage}`)}</Pill>;
}

/** Re-renders every minute so countdowns stay current. */
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** "2 days" / "5 hours" / "less than an hour" (rounded down; days from 48 h). */
export function spanText(t, ms) {
  const abs = Math.abs(ms);
  if (abs >= 2 * DAY) return t("contractor.deadline.days", { count: Math.floor(abs / DAY) });
  if (abs >= HOUR) return t("contractor.deadline.hours", { count: Math.floor(abs / HOUR) });
  return t("contractor.deadline.underHour");
}

/** Deadline countdown. The clock is paused while evidence waits for the admin (no countdown then). */
export function DeadlineCountdown({ deadline, done = false, className }) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  if (!deadline) return null;
  const due = new Date(deadline.effectiveDeadline).getTime();
  const date = formatDate(deadline.effectiveDeadline, i18n.resolvedLanguage);
  if (done) return null;
  if (deadline.paused) {
    return (
      <p className={cx("flex items-center gap-1.5 text-caption text-charcoal-900", className)}>
        <Pause aria-hidden="true" className="size-4 shrink-0" />
        {t("contractor.deadline.paused", { date })}
      </p>
    );
  }
  const overdue = due < now;
  return (
    <p className={cx("flex items-center gap-1.5 text-caption", overdue ? "font-bold text-error" : "text-charcoal-900", className)}>
      <Clock aria-hidden="true" className="size-4 shrink-0" />
      {overdue ? t("contractor.deadline.overdue", { span: spanText(t, now - due) }) : t("contractor.deadline.due", { span: spanText(t, due - now) })}
      <span className="font-normal text-graphite-600">· {date}</span>
    </p>
  );
}

export const areaOf = (job) => job.addressText || job.areaName || null;

export function JobCard({ job }) {
  const { t } = useTranslation();
  const categoryName = useCategoryName();
  const lastRejected = job.stage === "REWORK" ? job.submissions.at(-1) : null;
  const done = job.stage === "COMPLETED";
  return (
    <article className="rounded-card border border-stone-300 bg-white">
      <Link to={`/contractor/jobs/${job.issueId}`} className="block rounded-card p-4 hover:bg-ivory-50/60 focus-visible:outline-2 focus-visible:outline-teal-700">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CategoryTile categoryKey={job.category.key} />
            <div className="min-w-0">
              <h2 className="text-label text-charcoal-900">{categoryName(job.category)}</h2>
              {areaOf(job) && (
                <p className="flex items-center gap-1 text-caption text-graphite-600">
                  <MapPin aria-hidden="true" className="size-4 shrink-0" />
                  <span className="truncate">{areaOf(job)}</span>
                </p>
              )}
            </div>
          </div>
          {job.priority && <PriorityPill level={job.priority} />}
        </div>
        {/* The citizen's words, as written. */}
        <p className="mt-3 line-clamp-2 text-body text-charcoal-900">{job.description}</p>
        {lastRejected && (
          <div className="mt-3 rounded-control border border-error-border bg-error-tint p-3">
            <StageLabel stage="REWORK" />
            {lastRejected.reviewReason && <p className="mt-1.5 text-caption text-charcoal-900">{lastRejected.reviewReason}</p>}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {done ? <StageLabel stage="COMPLETED" /> : <DeadlineCountdown deadline={job.deadline} />}
          {job.department && (
            <p className="flex items-center gap-1.5 text-caption text-graphite-600">
              <Building2 aria-hidden="true" className="size-4 shrink-0" />
              {job.department.name}
            </p>
          )}
        </div>
      </Link>
    </article>
  );
}
