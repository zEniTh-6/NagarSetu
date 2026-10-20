import { Link } from "react-router";
import { ChevronRight, MapPin, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "../StatusBadge.jsx";
import { CategoryTile, useCategoryName } from "./CategoryIcon.jsx";
import { formatRelative, shortRef } from "../../lib/format.js";

/** One issue in a list (My complaints, home). The citizen's text is shown as written. */
export function IssueCard({ issue, footer, supporting }) {
  const { t, i18n } = useTranslation();
  const categoryName = useCategoryName();
  return (
    <article className="rounded-card border border-stone-300 bg-white">
      <Link to={`/citizen/issues/${issue.id}`} className="block rounded-card p-4 hover:bg-ivory-50/60">
        <div className="flex items-center justify-between gap-3">
          <p className="tnum text-caption text-graphite-600">
            <span className="font-semibold text-charcoal-900">{shortRef(issue.id)}</span> · {formatRelative(issue.createdAt, i18n.resolvedLanguage)}
          </p>
          <StatusBadge status={issue.status} rejectionType={issue.rejectionType} />
        </div>
        <div className="mt-3 flex gap-3">
          <CategoryTile categoryKey={issue.category.key} />
          <div className="min-w-0 flex-1">
            <p className="text-label text-charcoal-900">{categoryName(issue.category)}</p>
            <p className="mt-0.5 line-clamp-2 text-body text-charcoal-900">{issue.description}</p>
            {/* Supporters get the area name, never the reporter's typed address (D-025). */}
            {(issue.addressText || issue.approxLocation) && (
              <p className="mt-1 flex items-center gap-1 text-caption text-graphite-600">
                <MapPin aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{issue.addressText || issue.areaName || t("feed.approxArea")}</span>
              </p>
            )}
            {supporting && (
              <p className="mt-1 flex items-center gap-1 text-caption text-sage-600">
                <Users aria-hidden="true" className="size-4 shrink-0" />
                {t("complaints.youSupport")}
              </p>
            )}
          </div>
          <ChevronRight aria-hidden="true" className="mt-2 size-5 shrink-0 text-graphite-600" />
        </div>
      </Link>
      {footer && <div className="border-t border-stone-300 px-4 py-3">{footer}</div>}
    </article>
  );
}
