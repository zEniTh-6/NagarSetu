import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { useCategoryName } from "../../components/citizen/CategoryIcon.jsx";
import { useNotifications } from "../../components/citizen/useNotifications.js";
import { notificationsApi, qk } from "../../api/citizen.js";
import { errorText } from "../../lib/errors.js";
import { formatDate, formatRelative, shortRef } from "../../lib/format.js";
import { useMe } from "../../auth/session.js";
import { cx } from "../../lib/cx.js";

/** Text for a notification: the server stores a type + params; we write the sentence in the user's language. */
export function useNotificationText() {
  const { t, i18n } = useTranslation();
  const categoryName = useCategoryName();
  const { user } = useMe();
  const contractor = user?.role === "CONTRACTOR";
  return (n) => {
    const p = n.params ?? {};
    let titleKey = `notifications.type.${n.type}`;
    // Contractors get their own wording (e.g. "Your repair was approved").
    if (contractor && i18n.exists(`notifications.contractor.${n.type}`)) titleKey = `notifications.contractor.${n.type}`;
    if (n.type === "REJECTED" && p.rejectionType === "NOT_OUR_JURISDICTION") titleKey = "notifications.type.FORWARDED";
    const title = i18n.exists(titleKey) ? t(titleKey) : t("notifications.type.OTHER");
    const lines = [];
    if (n.type === "REROUTED") lines.push(t("timeline.event.reroutedDetail", { from: categoryName(p.fromCategory), to: categoryName(p.toCategory) }));
    if (contractor && p.deadlineAt) lines.push(t("notifications.contractor.deadline", { date: formatDate(p.deadlineAt, i18n.resolvedLanguage) }));
    if (p.reason) lines.push(p.reason); // admin's words, shown as written
    if (n.type === "OFFICIAL_REPLY" && p.excerpt) lines.push(p.department ? `${p.department}: ${p.excerpt}` : p.excerpt);
    return { title, body: lines.join(" — ") };
  };
}

export default function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useMe();
  const { data, isPending, error, refetch } = useNotifications();
  const text = useNotificationText();
  const lang = i18n.resolvedLanguage;

  const open = async (n) => {
    if (!n.readAt) {
      notificationsApi.read(n.id).then(() => qc.invalidateQueries({ queryKey: qk.notifications })).catch(() => {});
    }
    if (n.issueId) navigate(user?.role === "CONTRACTOR" ? `/contractor/jobs/${n.issueId}` : `/citizen/issues/${n.issueId}`);
  };
  const readAll = async () => {
    await notificationsApi.readAll().catch(() => {});
    qc.invalidateQueries({ queryKey: qk.notifications });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-charcoal-900">{t("notifications.title")}</h1>
          <p className="mt-1 text-body text-graphite-600">{t(user?.role === "CONTRACTOR" ? "notifications.contractor.subtitle" : "notifications.subtitle")}</p>
        </div>
        {data?.unread > 0 && (
          <Button variant="ghost" size="sm" leftIcon={CheckCheck} onClick={readAll}>
            {t("notifications.readAll")}
          </Button>
        )}
      </div>

      <div className="mt-5">
        {isPending ? (
          <div className="flex justify-center py-12 text-teal-700">
            <Spinner />
          </div>
        ) : error ? (
          <Alert tone="error" title={errorText(t, i18n, error)} action={<Button size="sm" variant="outline" onClick={() => refetch()}>{t("common.retry")}</Button>} />
        ) : data.items.length === 0 ? (
          <Card>
            <EmptyState icon={BellOff} title={t("notifications.empty")} message={t(user?.role === "CONTRACTOR" ? "notifications.contractor.emptyBody" : "notifications.emptyBody")} />
          </Card>
        ) : (
          <ul className="overflow-hidden rounded-card border border-stone-300 bg-white">
            {data.items.map((n) => {
              const { title, body } = text(n);
              const unread = !n.readAt;
              return (
                <li key={n.id} className="border-b border-stone-300 last:border-0">
                  <button
                    type="button"
                    onClick={() => open(n)}
                    className={cx("flex w-full items-start gap-3 p-4 text-start hover:bg-ivory-50", unread && "bg-sage-100/30")}
                  >
                    <span className={cx("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full", unread ? "bg-teal-700 text-white" : "bg-ivory-50 text-graphite-600")}>
                      <Bell aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx("block text-body text-charcoal-900", unread && "font-semibold")}>
                        {title}
                        {unread && <span className="sr-only"> ({t("notifications.unread")})</span>}
                      </span>
                      {body && <span className="mt-0.5 block text-caption text-charcoal-900">{body}</span>}
                      <span className="tnum mt-1 block text-caption text-graphite-600">
                        {n.issueId && `${shortRef(n.issueId)} · `}
                        {formatRelative(n.createdAt, lang)}
                      </span>
                    </span>
                    {unread && <span aria-hidden="true" className="mt-2 size-2.5 shrink-0 rounded-full bg-error" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
