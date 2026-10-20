// "Is this the same problem?" Accept = support the existing report (no new issue).
// Deny = submit anyway; the admin sees a POSSIBLE_DUPLICATE flag. Never merged automatically.
import { useState } from "react";
import { Link } from "react-router";
import { MapPin, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "../../../components/BottomSheet.jsx";
import { Button } from "../../../components/Button.jsx";
import { Alert } from "../../../components/Alert.jsx";
import { StatusBadge } from "../../../components/StatusBadge.jsx";
import { CategoryTile, useCategoryName } from "../../../components/citizen/CategoryIcon.jsx";
import { issuesApi, qk } from "../../../api/citizen.js";
import { ApiError } from "../../../api/client.js";
import { errorText } from "../../../lib/errors.js";
import { formatDistance, formatRelative } from "../../../lib/format.js";

export function DuplicateSheet({ open, candidates, onClose, onSubmitAnyway, onSupported }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const categoryName = useCategoryName();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const lang = i18n.resolvedLanguage;

  const support = async (id) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await issuesApi.support(id, { fromDuplicatePopup: true });
      qc.invalidateQueries({ queryKey: qk.supporting });
      onSupported(id, res.supporters);
    } catch (err) {
      setError({ id, err });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t("duplicate.title")}
      description={t("duplicate.body")}
      footer={
        <Button variant="outline" fullWidth onClick={onSubmitAnyway} disabled={!!busyId}>
          {t("duplicate.submitAnyway")}
        </Button>
      }
    >
      <ul className="space-y-3">
        {candidates.map((c) => (
          <li key={c.id} className="rounded-card border border-stone-300 p-4">
            <div className="flex items-start gap-3">
              <CategoryTile categoryKey={c.category.key} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-label text-charcoal-900">{categoryName(c.category)}</p>
                  <StatusBadge status={c.status} />
                </div>
                <p className="mt-1 line-clamp-3 text-body text-charcoal-900">{c.description}</p>
                <p className="tnum mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-graphite-600">
                  <span className="inline-flex items-center gap-1">
                    <MapPin aria-hidden="true" className="size-4" />
                    {t("duplicate.away", { distance: formatDistance(c.distanceM, lang) })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users aria-hidden="true" className="size-4" />
                    {t("duplicate.supporters", { count: c.supporters })}
                  </span>
                  <span>{formatRelative(c.reportedAt, lang)}</span>
                </p>
              </div>
            </div>
            {error?.id === c.id && (
              <Alert
                tone="error"
                className="mt-3"
                title={error.err instanceof ApiError && error.err.code === "OWN_ISSUE" ? t("duplicate.own") : errorText(t, i18n, error.err)}
                action={
                  error.err instanceof ApiError && error.err.code === "OWN_ISSUE" ? (
                    <Link className="text-label text-teal-700 underline" to={`/citizen/issues/${c.id}`}>
                      {t("duplicate.openOwn")}
                    </Link>
                  ) : null
                }
              />
            )}
            <Button className="mt-3" fullWidth loading={busyId === c.id} disabled={!!busyId && busyId !== c.id} onClick={() => support(c.id)}>
              {t("duplicate.same")}
            </Button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
