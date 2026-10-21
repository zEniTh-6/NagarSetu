// What the department decided, with its reason as written, on the citizen's issue page.
// Notifications link here: #feedback-response (a "not fixed" answer was reviewed) and #decision
// (rejected, forwarded, linked, rerouted, reopened).
import { MessageSquareReply, RotateCcw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../Alert.jsx";
import { Card } from "../Card.jsx";
import { formatDateTime } from "../../lib/format.js";
import { useCategoryName } from "./CategoryIcon.jsx";

export const RESPONSE_ID = "feedback-response";
export const DECISION_ID = "decision";
const ACTIVE = ["REPORTED", "ACKNOWLEDGED", "IN_PROGRESS"];

/** The admin's words, quoted, never translated. */
export function ReasonQuote({ reason }) {
  const { t } = useTranslation();
  if (!reason) return null;
  return (
    <blockquote className="mt-2 border-s-2 border-current/30 ps-3 text-charcoal-900">
      <span className="font-semibold">{t("closed.reason")}:</span> {reason}
    </blockquote>
  );
}

/**
 * The citizen's own "not fixed" answer, and the department's response once it has decided:
 * kept resolved or reopened, the reason as written, the department and the date.
 */
export function FeedbackResponse({ issue }) {
  const { t, i18n } = useTranslation();
  const mine = issue.myFeedback;
  if (!mine) return null;
  const lang = i18n.resolvedLanguage;
  const d = mine.decision;
  const Icon = d?.outcome === "REOPENED" ? RotateCcw : ShieldCheck;
  return (
    <section id={RESPONSE_ID} tabIndex={-1} aria-label={t("response.title")} className="scroll-mt-20 space-y-3 outline-none">
      <div className="rounded-card border border-stone-300 bg-ivory-50 p-4 text-body text-charcoal-900">
        <p>
          <span className="font-semibold">{t("response.youSaid")}</span>
          <span className="text-graphite-600"> — {t(d ? "response.reviewed" : "response.waiting")}</span>
        </p>
        {mine.reason && <p className="mt-1 whitespace-pre-wrap">“{mine.reason}”</p>}
        <p className="tnum mt-1 text-caption text-graphite-600">{formatDateTime(mine.at, lang)}</p>
      </div>
      {d && (
        <Card variant="highlight">
          <h3 className="flex items-center gap-2 text-h3 text-charcoal-900">
            <MessageSquareReply aria-hidden="true" className="size-5 shrink-0 text-teal-700" />
            {t("response.title")}
          </h3>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-sage-100 px-3 py-1 text-label text-forest-900">
            <Icon aria-hidden="true" className="size-4" />
            {t(`response.outcome.${d.outcome}`)}
          </p>
          {d.reason && <p className="mt-3 whitespace-pre-wrap text-body text-charcoal-900">{d.reason}</p>}
          <p className="tnum mt-2 text-caption text-graphite-600">
            {t("response.by", { department: d.department || t("response.department"), date: formatDateTime(d.at, lang) })}
          </p>
          <p className="mt-3 text-caption text-graphite-600">{t(d.outcome === "REOPENED" ? "response.reopenedNote" : "response.keptNote")}</p>
        </Card>
      )}
    </section>
  );
}

/**
 * Active issue: the latest reopen or reroute with its reason (the timeline has the full history).
 * A reopen that answered this citizen's own "not fixed" is shown by FeedbackResponse instead.
 */
export function LatestDecision({ issue }) {
  const { t } = useTranslation();
  const categoryName = useCategoryName();
  if (!ACTIVE.includes(issue.status)) return null;
  const last = [...(issue.timeline ?? [])].reverse().find((e) => e.type === "REOPENED" || e.type === "REROUTED");
  if (!last) return null;
  if (last.type === "REOPENED" && issue.myFeedback?.decision?.outcome === "REOPENED") return null;
  const rerouted = last.type === "REROUTED";
  return (
    <div id={DECISION_ID} tabIndex={-1} className="scroll-mt-20 outline-none">
      <Alert tone="info" title={t(rerouted ? "decision.reroutedTitle" : "decision.reopenedTitle")}>
        {rerouted && <p>{t("timeline.event.reroutedDetail", { from: categoryName(last.fromCategory), to: categoryName(last.toCategory) })}</p>}
        <ReasonQuote reason={last.reason} />
      </Alert>
    </div>
  );
}
