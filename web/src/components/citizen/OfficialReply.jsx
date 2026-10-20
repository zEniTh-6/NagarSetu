import { BadgeCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatRelative } from "../../lib/format.js";
import { cx } from "../../lib/cx.js";

/** An admin's official reply, highlighted and signed with the department's name (D-025). */
export function OfficialReply({ reply, compact = false, className }) {
  const { t, i18n } = useTranslation();
  const department = reply.author?.department || t("comments.departmentFallback");
  return (
    <div className={cx("rounded-control border border-teal-700/30 bg-sage-100 p-3", className)}>
      <p className="flex items-center gap-1.5 text-caption text-forest-900">
        <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-teal-700" />
        <span className="font-bold">{t("comments.official")}</span>
        <span>· {formatRelative(reply.createdAt, i18n.resolvedLanguage)}</span>
      </p>
      <p className="mt-0.5 text-caption font-semibold text-forest-900">{department}</p>
      {/* The admin's words, shown as written. */}
      <p className={cx("mt-1 whitespace-pre-wrap text-body text-charcoal-900", compact && "line-clamp-3")}>{reply.body}</p>
    </div>
  );
}
