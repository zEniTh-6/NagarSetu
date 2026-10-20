// Official reply and comments on one issue (admin view: hidden ones and reports included).
// Also used by the moderation queue for Hide and Suspend.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, Flag, Send, UserX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../../components/Alert.jsx";
import { Button } from "../../../components/Button.jsx";
import { Card } from "../../../components/Card.jsx";
import { Spinner } from "../../../components/Spinner.jsx";
import { useToast } from "../../../components/Toast.jsx";
import { ConfirmAction } from "../../../components/admin/ConfirmAction.jsx";
import { OfficialReply } from "../../../components/citizen/OfficialReply.jsx";
import { adminApi, ak } from "../../../api/admin.js";
import { errorText } from "../../../lib/errors.js";
import { formatRelative } from "../../../lib/format.js";

/** Hide (reason, audited) and Suspend author (reason, audited) for one comment. */
export function CommentModeration({ comment }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ak.all });
  const suspended = comment.author?.status === "DEACTIVATED";
  return (
    <div className="flex flex-wrap gap-2">
      {!comment.hidden && (
        <Button size="sm" variant="outline" leftIcon={EyeOff} onClick={() => setOpen("hide")}>
          {t("admin.comments.hide")}
        </Button>
      )}
      {comment.author?.role === "CITIZEN" && !suspended && (
        <Button size="sm" variant="destructive-outline" leftIcon={UserX} onClick={() => setOpen("suspend")}>
          {t("admin.comments.suspend")}
        </Button>
      )}
      {suspended && <span className="self-center text-caption font-semibold text-error">{t("admin.comments.authorSuspended")}</span>}
      <ConfirmAction
        open={open === "hide"}
        onClose={() => setOpen(null)}
        title={t("admin.comments.hideTitle")}
        description={t("admin.comments.hideBody")}
        confirmLabel={t("admin.comments.hide")}
        tone="destructive"
        reason="required"
        reasonLabel={t("admin.comments.reasonLogged")}
        onConfirm={async (reason) => {
          await adminApi.hideComment(comment.id, reason);
          toast.show({ tone: "success", title: t("admin.comments.hidden") });
          refresh();
        }}
      >
        <blockquote className="rounded-control border border-stone-300 bg-ivory-50 p-3 text-body text-charcoal-900">{comment.body}</blockquote>
      </ConfirmAction>
      <ConfirmAction
        open={open === "suspend"}
        onClose={() => setOpen(null)}
        title={t("admin.comments.suspendTitle", { name: comment.author?.name ?? "" })}
        description={t("admin.comments.suspendBody")}
        confirmLabel={t("admin.comments.suspend")}
        tone="destructive"
        reason="required"
        reasonLabel={t("admin.comments.reasonLogged")}
        onConfirm={async (reason) => {
          await adminApi.suspend(comment.author.id, reason);
          toast.show({ tone: "success", title: t("admin.comments.suspended") });
          refresh();
        }}
      />
    </div>
  );
}

export function AdminComment({ comment, showModeration = true }) {
  const { t, i18n } = useTranslation();
  if (comment.official) return <OfficialReply reply={{ ...comment, author: { department: comment.author?.department } }} />;
  return (
    <div className={comment.hidden ? "rounded-control border border-dashed border-stone-300 bg-ivory-50 p-3" : "rounded-control border border-stone-300 bg-white p-3"}>
      <p className="text-caption text-graphite-600">
        <span className="font-semibold text-charcoal-900">{comment.author?.name}</span> · {formatRelative(comment.createdAt, i18n.resolvedLanguage)}
        {comment.reports?.total > 0 && (
          <span className="ms-2 inline-flex items-center gap-1 font-semibold text-warning">
            <Flag aria-hidden="true" className="size-3.5" />
            {t("admin.comments.reports", { count: comment.reports.total })}
            {" · "}
            {Object.entries(comment.reports.byReason)
              .map(([r, n]) => `${t(`comments.reason.${r}`)} (${n})`)
              .join(", ")}
          </span>
        )}
      </p>
      {/* As written by the citizen. */}
      <p className="mt-1 whitespace-pre-wrap break-words text-body text-charcoal-900">{comment.body}</p>
      {comment.reports?.notes?.length > 0 && (
        <ul className="mt-2 space-y-1 text-caption text-charcoal-900">
          {comment.reports.notes.map((n, i) => (
            <li key={i}>
              “{n.note}” — {t(`comments.reason.${n.reason}`)}
            </li>
          ))}
        </ul>
      )}
      {comment.hidden && (
        <p className="mt-2 text-caption text-graphite-600">
          {t("admin.comments.hiddenBy", { name: comment.hidden.by?.name ?? "", reason: comment.hidden.reason })}
        </p>
      )}
      {showModeration && (
        <div className="mt-3">
          <CommentModeration comment={comment} />
        </div>
      )}
    </div>
  );
}

export function CommentsPanel({ issueId }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({ queryKey: ak.comments(issueId), queryFn: () => adminApi.comments(issueId) });

  return (
    <Card>
      <h2 className="text-h3 text-charcoal-900">{t("admin.comments.issueTitle")}</h2>
      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim().length >= 3) setConfirm(true);
        }}
      >
        <label htmlFor="official-reply" className="text-label text-charcoal-900">
          {t("admin.comments.replyLabel")}
        </label>
        <p className="text-caption text-graphite-600">{t("admin.comments.replyHint")}</p>
        <textarea
          id="official-reply"
          rows={3}
          maxLength={1000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="mt-2 w-full rounded-control border border-field-border bg-white p-3 text-body text-charcoal-900 focus:outline-2 focus:outline-teal-700"
        />
        <Button type="submit" size="sm" className="mt-2" leftIcon={Send} disabled={body.trim().length < 3}>
          {t("admin.comments.postReply")}
        </Button>
      </form>
      <ConfirmAction
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("admin.comments.replyConfirmTitle")}
        description={t("admin.comments.replyConfirmBody")}
        confirmLabel={t("admin.comments.postReply")}
        onConfirm={async () => {
          await adminApi.reply(issueId, body);
          setBody("");
          toast.show({ tone: "success", title: t("admin.comments.replyPosted") });
          qc.invalidateQueries({ queryKey: ak.comments(issueId) });
        }}
      >
        <blockquote className="whitespace-pre-wrap rounded-control border border-stone-300 bg-ivory-50 p-3 text-body text-charcoal-900">{body}</blockquote>
      </ConfirmAction>

      <div className="mt-5">
        {q.isPending ? (
          <Spinner />
        ) : q.error ? (
          <Alert tone="error" title={errorText(t, i18n, q.error)} />
        ) : q.data.items.length === 0 ? (
          <p className="text-caption text-graphite-600">{t("admin.comments.none")}</p>
        ) : (
          <ul className="space-y-3">
            {q.data.items.map((c) => (
              <li key={c.id}>
                <AdminComment comment={c} showModeration={!c.official} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
