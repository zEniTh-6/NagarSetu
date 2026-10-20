import { lazy, Suspense, useCallback, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { BottomSheet } from "../../components/BottomSheet.jsx";
import { Button } from "../../components/Button.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { StatusBadge } from "../../components/StatusBadge.jsx";
import { CategoryChips } from "../../components/citizen/CategoryChips.jsx";
import { CategoryTile, useCategoryName } from "../../components/citizen/CategoryIcon.jsx";
import { SupportButton, UpvoteButton } from "../../components/citizen/CommunityActions.jsx";
import { AreaLine } from "../../components/citizen/FeedCard.jsx";
import { useIssue } from "../../components/citizen/useIssue.js";
import { feedApi, qk } from "../../api/citizen.js";
import { errorText } from "../../lib/errors.js";
import { formatRelative } from "../../lib/format.js";
import { roundBbox } from "../../lib/pins.js";

const PublicMap = lazy(() => import("../../components/citizen/PublicMap.jsx"));
const MAX_IN_SHEET = 10;

/** One report in the pin sheet: loads its public (or own) view. */
function PinPreview({ id, full }) {
  const { t, i18n } = useTranslation();
  const categoryName = useCategoryName();
  const { data: issue, isPending, error } = useIssue(id);
  if (isPending) {
    return (
      <div className="flex justify-center py-6 text-teal-700">
        <Spinner />
      </div>
    );
  }
  if (error) return <Alert tone="error" title={errorText(t, i18n, error)} />;
  return (
    <div className="rounded-control border border-stone-300 bg-white p-3">
      <div className="flex gap-3">
        {issue.photo ? (
          <img src={issue.photo.url} alt={t("feed.photoAlt")} className="size-20 shrink-0 rounded-control border border-stone-300 object-cover" />
        ) : (
          <CategoryTile categoryKey={issue.category.key} size="lg" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-label text-charcoal-900">{categoryName(issue.category)}</p>
            <StatusBadge status={issue.status} rejectionType={issue.rejectionType} />
          </div>
          <p className="mt-1 line-clamp-2 text-body text-charcoal-900">{issue.description}</p>
          <p className="tnum mt-0.5 text-caption text-graphite-600">{formatRelative(issue.createdAt, i18n.resolvedLanguage)}</p>
          <AreaLine issue={issue} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {full && <UpvoteButton issue={issue} />}
        {full && <SupportButton issue={issue} />}
        <Button size="sm" variant={full ? "primary" : "outline"} rightIcon={ArrowRight} to={`/citizen/issues/${id}`} className="ms-auto">
          {t("publicMap.details")}
        </Button>
      </div>
    </div>
  );
}

// Map of public issues (D-022), approximate pins (D-025). Not copied from Stitch: search box, voice,
// layers, "metres from you".
export default function MapPage() {
  const { t, i18n } = useTranslation();
  const [category, setCategory] = useState(null);
  const [bbox, setBbox] = useState(null);
  const [selected, setSelected] = useState(null);
  const onBounds = useCallback((b) => setBbox(roundBbox(b)), []);

  const q = useQuery({
    queryKey: qk.map(bbox, category),
    queryFn: ({ signal }) => feedApi.map({ bbox, category: category ?? undefined }, { signal }),
    enabled: Boolean(bbox),
    placeholderData: keepPreviousData,
  });
  const pins = q.data?.pins ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-h1 text-charcoal-900">{t("map.title")}</h1>
        <p className="mt-1 text-body text-graphite-600">{t("publicMap.subtitle")}</p>
      </header>
      <CategoryChips value={category} onChange={setCategory} />

      <div aria-live="polite" className="space-y-2">
        {q.error && <Alert tone="error" title={t("publicMap.error")}>{errorText(t, i18n, q.error)}</Alert>}
        {q.data?.truncated && <Alert tone="info" title={t("publicMap.truncated", { count: pins.length })} />}
        {q.isSuccess && !q.isPlaceholderData && pins.length === 0 && <p className="text-caption text-graphite-600">{t("publicMap.none")}</p>}
      </div>

      <Suspense fallback={<div className="h-[60dvh] min-h-80 rounded-card bg-white" />}>
        <PublicMap pins={pins} onBounds={onBounds} onSelect={setSelected} />
      </Suspense>

      {selected && (
        <BottomSheet open onClose={() => setSelected(null)} title={t("publicMap.group", { count: selected.length })}>
          <ul className="space-y-3">
            {selected.slice(0, MAX_IN_SHEET).map((id) => (
              <li key={id}>
                <PinPreview id={id} full={selected.length === 1} />
              </li>
            ))}
          </ul>
        </BottomSheet>
      )}
    </div>
  );
}
