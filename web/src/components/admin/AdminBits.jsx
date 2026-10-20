// Small admin table/review pieces: AI label, community signal, deadline, reference, page header.
import { Bot, Clock, Pause } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Pill } from "../Pill.jsx";
import { Button } from "../Button.jsx";
import { PRIORITY_STYLES } from "../PriorityPill.jsx";
import { formatDate, formatDateTime, shortRef } from "../../lib/format.js";
import { cx } from "../../lib/cx.js";

/** AI risk level, always labelled as the AI's (a suggestion, never a decision). */
export function AiRisk({ level, className }) {
  const { t } = useTranslation();
  if (!level) return <span className="text-caption text-graphite-600">—</span>;
  const style = PRIORITY_STYLES[level];
  return (
    <Pill icon={Bot} className={cx(style?.className, "border border-dashed border-current", className)} title={t("admin.ai.suggestionTitle")}>
      {t("admin.ai.short")} · {t(`priority.${level}`)}
    </Pill>
  );
}

/** Upvotes · distinct supporters · share of new accounts (upvotes ≠ severity). */
export function CommunitySignal({ community, compact = false }) {
  const { t } = useTranslation();
  if (!community) return null;
  const share = community.accounts ? Math.round((community.newAccounts / community.accounts) * 100) : 0;
  return (
    <div className="tnum text-caption text-charcoal-900">
      <p>
        {t("admin.signal.upvotes", { count: community.upvotes })} · {t("admin.signal.backers", { count: community.accounts })}
      </p>
      {(!compact || community.accounts > 0) && (
        <p className={community.lowDiversity ? "font-semibold text-error" : "text-graphite-600"}>
          {t("admin.signal.newShare", { percent: share, days: community.newAccountDays ?? 7 })}
          {community.lowDiversity && <> · {t("admin.signal.lowDiversity")}</>}
        </p>
      )}
    </div>
  );
}

export function DeadlineCell({ assignment }) {
  const { t, i18n } = useTranslation();
  if (!assignment) return <span className="text-caption text-graphite-600">—</span>;
  const d = assignment.deadline;
  return (
    <span className={cx("inline-flex items-center gap-1 text-caption", assignment.overdue ? "font-bold text-error" : "text-charcoal-900")}>
      {d.paused ? <Pause aria-hidden="true" className="size-4" /> : <Clock aria-hidden="true" className="size-4" />}
      <span className="tnum">{formatDate(d.effectiveDeadline, i18n.resolvedLanguage)}</span>
      {assignment.overdue && <span>· {t("admin.deadline.overdue")}</span>}
      {d.paused && <span className="font-normal text-graphite-600">· {t("admin.deadline.paused")}</span>}
    </span>
  );
}

export const Ref = ({ id }) => <span className="tnum font-semibold text-charcoal-900">{shortRef(id)}</span>;

export function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-h1 text-charcoal-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-body text-graphite-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Simple pager for server-paged lists. */
export function Pager({ page, pageSize, total, onPage }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <nav aria-label={t("admin.pager.label")} className="mt-4 flex items-center justify-between gap-3">
      <p className="tnum text-caption text-graphite-600">{t("admin.pager.showing", { from: (page - 1) * pageSize + 1, to: Math.min(total, page * pageSize), total })}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {t("admin.pager.previous")}
        </Button>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          {t("admin.pager.next")}
        </Button>
      </div>
    </nav>
  );
}

export const When = ({ at }) => {
  const { i18n } = useTranslation();
  return <span className="tnum">{formatDateTime(at, i18n.resolvedLanguage)}</span>;
};
