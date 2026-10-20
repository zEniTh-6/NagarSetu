import { Camera, LoaderCircle, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../Alert.jsx";
import { Button } from "../Button.jsx";
import { useCategoryName } from "./CategoryIcon.jsx";

/**
 * The photo check as the citizen sees it (server `validation.state`). The AI never rejects:
 * INVALID only asks for a retake (D-010); UNCERTAIN or a failed check goes to the admin.
 */
export function ValidationNotice({ issue }) {
  const { t } = useTranslation();
  if (issue.status !== "REPORTED") return null;
  const v = issue.validation ?? { state: "CHECKING" };

  if (v.state === "CHECKING") {
    return (
      <div role="status" className="flex items-start gap-3 rounded-control border border-stone-300 bg-ivory-50 p-4">
        <LoaderCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 animate-spin text-teal-700" />
        <div>
          <p className="text-label text-charcoal-900">{t("validation.checkingTitle")}</p>
          <p className="text-caption text-graphite-600">{t("validation.checkingBody")}</p>
        </div>
      </div>
    );
  }
  if (v.state === "RETAKE_REQUESTED") {
    return (
      <Alert
        tone="warning"
        title={t("validation.retakeTitle")}
        action={
          <Button size="sm" to={`/citizen/issues/${issue.id}/retake`} leftIcon={Camera}>
            {t("validation.retakeAction")}
          </Button>
        }
      >
        <p>{t("validation.retakeBody")}</p>
        {v.reason && (
          <p className="mt-1">
            <span className="font-semibold">{t("ai.suggestion", { verdict: t("ai.INVALID") })}:</span> {v.reason}
          </p>
        )}
      </Alert>
    );
  }
  if (v.state === "UNDER_REVIEW") {
    return (
      <div className="flex items-start gap-3 rounded-control border border-stone-300 bg-ivory-50 p-4">
        <UserCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-sage-600" />
        <div>
          <p className="text-label text-charcoal-900">{t("validation.reviewTitle")}</p>
          <p className="text-caption text-graphite-600">{t("validation.reviewBody")}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-control border border-stone-300 bg-white p-4">
      <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
      <p className="text-caption text-charcoal-900">{t("validation.okBody")}</p>
    </div>
  );
}

/**
 * The AI thinks the photo fits another category. Information only: citizens can't change a report
 * after submitting (D-017); the department admin reroutes it if needed.
 */
export function CategorySuggestion({ issue }) {
  const { t } = useTranslation();
  const categoryName = useCategoryName();
  const s = issue.suggestedCategory;
  if (!s || s.key === issue.category.key || issue.status !== "REPORTED") return null;
  return (
    <div className="flex items-start gap-3 rounded-control border border-info/30 bg-info-tint p-4">
      <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info" />
      <div className="text-caption text-charcoal-900">
        <p className="text-label text-info">{t("suggestion.title", { category: categoryName(s) })}</p>
        <p className="mt-0.5">{t("suggestion.body", { category: categoryName(issue.category) })}</p>
      </div>
    </div>
  );
}
