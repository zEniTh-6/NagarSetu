// One public issue in the feed (design/stitch/citizen/home-feed). No reporter, no exact location:
// the area name (or "Approximate location"), the stripped public photo and the community counts.
import { Link } from "react-router";
import { MapPin, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "../StatusBadge.jsx";
import { formatRelative } from "../../lib/format.js";
import { CategoryTile, useCategoryName } from "./CategoryIcon.jsx";
import { OfficialReply } from "./OfficialReply.jsx";
import { UpvoteButton } from "./CommunityActions.jsx";

export function AreaLine({ issue, className }) {
  const { t } = useTranslation();
  return (
    <p className={["flex items-center gap-1 text-caption text-graphite-600", className].filter(Boolean).join(" ")}>
      <MapPin aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{issue.areaName || t("feed.approxArea")}</span>
    </p>
  );
}

export function FeedCard({ issue }) {
  const { t, i18n } = useTranslation();
  const categoryName = useCategoryName();
  const to = `/citizen/issues/${issue.id}`;
  return (
    <article aria-labelledby={`feed-${issue.id}`} className="rounded-card border border-stone-300 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CategoryTile categoryKey={issue.category.key} />
          <div className="min-w-0">
            <p className="text-label text-charcoal-900">{categoryName(issue.category)}</p>
            <p className="tnum text-caption text-graphite-600">
              {formatRelative(issue.createdAt, i18n.resolvedLanguage)}
              {issue.viewer?.relation === "REPORTER" && <> · {t("feed.yours")}</>}
            </p>
          </div>
        </div>
        <StatusBadge status={issue.status} />
      </div>

      <Link to={to} className="mt-3 block rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
        {/* The citizen's words, shown as written. */}
        <h2 id={`feed-${issue.id}`} className="line-clamp-3 text-body font-semibold text-charcoal-900">
          {issue.description}
        </h2>
        <AreaLine issue={issue} className="mt-1" />
        {issue.photo && (
          <img
            src={issue.photo.url}
            alt={t("feed.photoAlt")}
            loading="lazy"
            className="mt-3 aspect-[4/3] w-full rounded-control border border-stone-300 bg-ivory-50 object-cover"
          />
        )}
      </Link>

      {issue.latestOfficialReply && <OfficialReply reply={issue.latestOfficialReply} compact className="mt-3" />}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-stone-300 pt-3">
        <UpvoteButton issue={issue} />
        <Link to={`${to}#comments`} className="tap inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-label text-graphite-600 hover:text-charcoal-900">
          <MessageSquare aria-hidden="true" className="size-5" />
          <span className="tnum">{t("feed.comments", { count: issue.community?.comments ?? 0 })}</span>
        </Link>
      </div>
    </article>
  );
}
