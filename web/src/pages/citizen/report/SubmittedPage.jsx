import { useParams } from "react-router";
import { CircleCheckBig } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FlowHeader } from "../../../components/citizen/CitizenLayout.jsx";
import { CategorySuggestion, ValidationNotice } from "../../../components/citizen/ValidationNotice.jsx";
import { useIssue } from "../../../components/citizen/useIssue.js";
import { Button } from "../../../components/Button.jsx";
import { Card } from "../../../components/Card.jsx";
import { Spinner } from "../../../components/Spinner.jsx";
import { Alert } from "../../../components/Alert.jsx";
import { shortRef } from "../../../lib/format.js";

/** After submitting: the report is saved; the photo check runs in the background (D-014). */
export default function SubmittedPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const issue = useIssue(id);

  return (
    <div className="min-h-dvh bg-ivory-50">
      <FlowHeader title={t("submitted.header")} backTo="/citizen" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Card variant="hero" className="text-center">
          <CircleCheckBig aria-hidden="true" className="mx-auto size-12 text-brass-400" />
          <h2 className="mt-3 text-h1 text-ivory-50">{t("submitted.title")}</h2>
          <p className="mt-2 text-body text-sage-100">{t("submitted.body")}</p>
          {issue.data && <p className="tnum mt-4 text-eyebrow uppercase text-brass-400">{t("submitted.ref", { ref: shortRef(issue.data.id) })}</p>}
        </Card>

        {issue.isPending ? (
          <div className="flex justify-center py-6 text-teal-700">
            <Spinner />
          </div>
        ) : issue.error ? (
          <Alert tone="info" title={t("submitted.saved")} />
        ) : (
          <>
            <ValidationNotice issue={issue.data} />
            <CategorySuggestion issue={issue.data} />
          </>
        )}

        <Card>
          <h3 className="text-h3 text-charcoal-900">{t("submitted.nextTitle")}</h3>
          <ol className="mt-3 space-y-2 text-body text-charcoal-900">
            {["next1", "next2", "next3"].map((k, i) => (
              <li key={k} className="flex gap-3">
                <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-full bg-sage-100 text-caption font-semibold text-teal-700">{i + 1}</span>
                {t(`submitted.${k}`)}
              </li>
            ))}
          </ol>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Button to={`/citizen/issues/${id}`}>{t("submitted.view")}</Button>
          <Button variant="outline" to="/citizen">
            {t("submitted.home")}
          </Button>
        </div>
      </main>
    </div>
  );
}
