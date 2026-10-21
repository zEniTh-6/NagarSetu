import { useTranslation } from "react-i18next";
import { Timeline } from "../Timeline.jsx";
import { formatDateTime } from "../../lib/format.js";
import { useCategoryName } from "./CategoryIcon.jsx";

const MAIN_PATH = ["REPORTED", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"];
const ACTIVE = ["REPORTED", "ACKNOWLEDGED", "IN_PROGRESS"];

/**
 * The server's `timeline` (from the audit log) as steps. Past events are done; for an active issue
 * the main steps not reached yet are shown as upcoming.
 */
export function buildSteps(issue, t, lang, categoryName) {
  const events = issue.timeline ?? [];
  const steps = events.map((e, i) => {
    let key = e.type;
    if (e.type === "REJECTED" && e.rejectionType === "NOT_OUR_JURISDICTION") key = "FORWARDED";
    if (e.type === "REOPENED" && e.afterDispute) key = "REOPENED_AFTER_DISPUTE";
    let detail = e.reason ?? null;
    if (e.type === "REROUTED") {
      const moved = t("timeline.event.reroutedDetail", { from: categoryName(e.fromCategory), to: categoryName(e.toCategory) });
      detail = e.reason ? `${moved} — ${e.reason}` : moved;
    }
    return { key: `${e.type}-${i}`, title: t(`timeline.event.${key}`), time: formatDateTime(e.at, lang), detail, state: "done" };
  });

  if (ACTIVE.includes(issue.status)) {
    if (steps.length) steps[steps.length - 1].state = "current";
    // Main steps after the furthest one reached. A reopened issue starts again from ACKNOWLEDGED.
    const reached = MAIN_PATH.indexOf(issue.status);
    for (const s of MAIN_PATH.slice(reached + 1)) {
      steps.push({ key: `next-${s}`, title: t(`timeline.event.${s}`), state: "upcoming" });
    }
  }
  return steps;
}

export function IssueTimeline({ issue }) {
  const { t, i18n } = useTranslation();
  const categoryName = useCategoryName();
  return <Timeline label={t("issue.timeline")} steps={buildSteps(issue, t, i18n.resolvedLanguage, categoryName)} />;
}
