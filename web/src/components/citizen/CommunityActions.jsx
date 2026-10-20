// Upvote and Support (brief: "Feed, comments, upvotes"; D-025). Upvotes are a signal only: one per
// verified account, never on your own report, and they never change the priority.
import { useState } from "react";
import { ArrowBigUp, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "../Button.jsx";
import { useToast } from "../Toast.jsx";
import { issuesApi, qk } from "../../api/citizen.js";
import { useMe } from "../../auth/session.js";
import { errorText } from "../../lib/errors.js";
import { cx } from "../../lib/cx.js";
import { ACTIVE_STATUSES } from "./useMyIssues.js";

/** Why the upvote button is off, or null when it can be pressed. Removing an upvote always works. */
function blockedReason(issue, verified, upvoted) {
  if (issue.viewer?.relation === "REPORTER") return "ownReport";
  if (!verified) return "verifyFirst";
  if (!upvoted && !ACTIVE_STATUSES.includes(issue.status)) return "closed";
  return null;
}

/**
 * Toggle button with the count. `issue` is a public card, a public view or the follower view
 * (all carry `community.upvotes` and `viewer.upvoted`).
 */
export function UpvoteButton({ issue, className }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useMe();
  // What the server answered last; the props catch up when the lists refetch.
  const [override, setOverride] = useState(null);
  const [busy, setBusy] = useState(false);
  const upvoted = override?.upvoted ?? Boolean(issue.viewer?.upvoted);
  const count = override?.upvotes ?? issue.community?.upvotes ?? 0;
  const blocked = blockedReason(issue, Boolean(user?.emailVerified), upvoted);

  const toggle = async () => {
    setBusy(true);
    try {
      const res = upvoted ? await issuesApi.removeUpvote(issue.id) : await issuesApi.upvote(issue.id);
      setOverride({ upvoted: res.upvoted, upvotes: res.upvotes });
      qc.invalidateQueries({ queryKey: qk.feedAll });
      qc.invalidateQueries({ queryKey: qk.issue(issue.id) });
    } catch (err) {
      toast.show({ tone: "error", title: errorText(t, i18n, err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      aria-pressed={upvoted}
      disabled={busy || Boolean(blocked)}
      title={blocked ? t(`community.${blocked}`) : undefined}
      onClick={toggle}
      className={cx(
        "tap inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-label transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed",
        upvoted ? "border-2 border-teal-700 bg-sage-100 px-[13px] font-bold text-forest-900" : "border border-stone-300 bg-white font-medium text-charcoal-900 hover:bg-ivory-50",
        blocked && !upvoted && "text-graphite-600 opacity-80",
        className,
      )}
    >
      <ArrowBigUp aria-hidden="true" className={cx("size-5", upvoted && "fill-teal-700 text-teal-700")} />
      <span className="tnum">{t("community.upvotes", { count })}</span>
      <span className="sr-only">{blocked ? `. ${t(`community.${blocked}`)}` : ""}</span>
    </button>
  );
}

/** Support = follow the issue: updates, and a say in "fixed / not fixed". */
export function SupportButton({ issue, className }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useMe();
  const [busy, setBusy] = useState(false);
  const relation = issue.viewer?.relation ?? issue.relation ?? null;
  if (relation === "REPORTER") return null;
  if (relation === "SUPPORTER") {
    return (
      <span className={cx("inline-flex min-h-11 items-center gap-1.5 rounded-full bg-sage-100 px-3.5 text-label font-semibold text-sage-600", className)}>
        <Users aria-hidden="true" className="size-4" />
        {t("community.supporting")}
      </span>
    );
  }
  if (!ACTIVE_STATUSES.includes(issue.status)) return null;

  const support = async () => {
    setBusy(true);
    try {
      await issuesApi.support(issue.id);
      toast.show({ tone: "success", title: t("community.supported") });
      qc.invalidateQueries({ queryKey: qk.issue(issue.id) });
      qc.invalidateQueries({ queryKey: qk.supporting });
      qc.invalidateQueries({ queryKey: qk.feedAll });
    } catch (err) {
      toast.show({ tone: "error", title: errorText(t, i18n, err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant="secondary" leftIcon={Users} loading={busy} disabled={!user?.emailVerified} onClick={support} className={className}>
      {t("community.support")}
    </Button>
  );
}
