// Comments on an issue (design/mockups/citizen/issue-detail, "Community feed"). Flat list, newest
// first; official replies highlighted; a report button on other people's comments (D-025).
// Not copied from the mockups: comment likes, threaded replies, voice input.
import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, MessageSquare, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../Alert.jsx";
import { BottomSheet } from "../BottomSheet.jsx";
import { Button } from "../Button.jsx";
import { Card } from "../Card.jsx";
import { ChoiceCards } from "../ChoiceCards.jsx";
import { EmptyState } from "../EmptyState.jsx";
import { Spinner } from "../Spinner.jsx";
import { Textarea } from "../Textarea.jsx";
import { useToast } from "../Toast.jsx";
import { commentsApi, issuesApi, qk } from "../../api/citizen.js";
import { useMe } from "../../auth/session.js";
import { errorText } from "../../lib/errors.js";
import { formatRelative } from "../../lib/format.js";
import { OfficialReply } from "./OfficialReply.jsx";

const MAX = 1000;
const REASONS = ["SPAM", "ABUSIVE", "OFF_TOPIC", "OTHER"];

function ReportSheet({ comment, onClose }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await commentsApi.report(comment.id, { reason, note });
      toast.show({ tone: "success", title: t("comments.reportSent") });
      qc.invalidateQueries({ queryKey: ["issues", "comments"] });
      onClose();
    } catch (err) {
      setError(errorText(t, i18n, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t("comments.reportTitle")}
      description={t("comments.reportBody")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button leftIcon={Flag} loading={busy} disabled={!reason} onClick={send}>
            {t("comments.sendReport")}
          </Button>
        </>
      }
    >
      {error && <Alert tone="error" className="mb-4" title={error} />}
      <ChoiceCards
        label={t("comments.reasonLabel")}
        required
        value={reason}
        onChange={setReason}
        options={REASONS.map((r) => ({ value: r, label: t(`comments.reason.${r}`) }))}
      />
      <Textarea className="mt-4" label={t("comments.note")} optional rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
    </BottomSheet>
  );
}

function CommentItem({ comment, onReport }) {
  const { t, i18n } = useTranslation();
  if (comment.official) return <OfficialReply reply={comment} />;
  const name = comment.mine ? t("comments.you") : comment.author?.firstName || "—";
  return (
    <div className="flex gap-3 rounded-control border border-stone-300 bg-white p-3">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sage-100 text-label font-bold text-forest-900">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-caption text-graphite-600">
            <span className="font-semibold text-charcoal-900">{name}</span> · {formatRelative(comment.createdAt, i18n.resolvedLanguage)}
          </p>
          {!comment.mine &&
            (comment.reportedByMe ? (
              <span className="text-caption text-graphite-600">{t("comments.reported")}</span>
            ) : (
              <button
                type="button"
                onClick={() => onReport(comment)}
                aria-label={t("comments.report")}
                title={t("comments.report")}
                className="tap -m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-graphite-600 hover:bg-ivory-50 hover:text-charcoal-900"
              >
                <Flag aria-hidden="true" className="size-4" />
              </button>
            ))}
        </div>
        {/* Shown exactly as written. */}
        <p className="mt-0.5 whitespace-pre-wrap break-words text-body text-charcoal-900">{comment.body}</p>
      </div>
    </div>
  );
}

/**
 * `canPost`: the issue is public. Followers of a not-yet-public issue still read official replies.
 * `closed`: rejected / withdrawn / linked: no "comments open later" hint, and nothing when empty.
 */
export function CommentsSection({ issueId, canPost, closed = false }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useMe();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [reporting, setReporting] = useState(null);

  const q = useInfiniteQuery({
    queryKey: qk.comments(issueId),
    queryFn: ({ pageParam }) => issuesApi.comments(issueId, { page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;
  const verified = Boolean(user?.emailVerified);
  if (closed && !canPost && q.isSuccess && total === 0) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await issuesApi.addComment(issueId, body);
      setBody("");
      toast.show({ tone: "success", title: t("comments.posted") });
      qc.invalidateQueries({ queryKey: qk.comments(issueId) });
      qc.invalidateQueries({ queryKey: qk.issue(issueId) });
      qc.invalidateQueries({ queryKey: qk.feedAll });
    } catch (err) {
      setError(errorText(t, i18n, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="comments" aria-labelledby="comments-title" className="scroll-mt-20">
      <h2 id="comments-title" className="mb-3 flex items-center gap-2 text-h2 text-charcoal-900">
        {t("comments.title")}
        {total > 0 && <span className="tnum text-body font-normal text-graphite-600">({total})</span>}
      </h2>

      {!canPost ? (
        !closed && <p className="mb-3 text-caption text-graphite-600">{t("comments.notPublicYet")}</p>
      ) : !verified ? (
        <Alert
          tone="warning"
          className="mb-3"
          title={t("comments.verifyFirst")}
          action={
            <Button size="sm" to="/verify-email">
              {t("home.verifyAction")}
            </Button>
          }
        />
      ) : (
        <form onSubmit={submit} className="mb-4 space-y-3">
          {error && <Alert tone="error" title={error} />}
          <Textarea label={t("comments.label")} rows={3} maxLength={MAX} value={body} onChange={(e) => setBody(e.target.value)} />
          <Button type="submit" size="sm" leftIcon={Send} loading={busy} disabled={!body.trim()}>
            {t("comments.send")}
          </Button>
        </form>
      )}

      {q.isPending ? (
        <div className="flex justify-center py-6 text-teal-700">
          <Spinner />
        </div>
      ) : q.error ? (
        <Alert tone="error" title={errorText(t, i18n, q.error)} />
      ) : items.length === 0 ? (
        canPost && (
          <Card variant="muted">
            <EmptyState icon={MessageSquare} title={t("comments.empty")} message={t("comments.emptyBody")} />
          </Card>
        )
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id}>
              <CommentItem comment={c} onReport={setReporting} />
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && (
        <Button variant="ghost" className="mt-3" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          {t("comments.loadMore")}
        </Button>
      )}
      {reporting && <ReportSheet comment={reporting} onClose={() => setReporting(null)} />}
    </section>
  );
}
