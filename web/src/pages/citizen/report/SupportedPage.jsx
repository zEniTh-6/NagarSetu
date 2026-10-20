import { useLocation, useParams } from "react-router";
import { HeartHandshake } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FlowHeader } from "../../../components/citizen/CitizenLayout.jsx";
import { Button } from "../../../components/Button.jsx";
import { Card } from "../../../components/Card.jsx";
import { shortRef } from "../../../lib/format.js";

/**
 * The citizen chose "same problem" in the duplicate sheet: no new report, they now support the
 * existing one. Support is a signal for the admin; it never dispatches anyone or changes priority.
 */
export default function SupportedPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const supporters = useLocation().state?.supporters;

  return (
    <div className="min-h-dvh bg-ivory-50">
      <FlowHeader title={t("supported.header")} backTo="/citizen" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Card className="text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-card bg-sage-100 text-teal-700">
            <HeartHandshake aria-hidden="true" className="size-7" />
          </div>
          <h2 className="text-h1 text-charcoal-900">{t("supported.title")}</h2>
          <p className="tnum mt-1 text-caption text-graphite-600">{shortRef(id)}</p>
          <p className="mt-3 text-body text-graphite-600">{t("supported.body")}</p>
          {supporters != null && <p className="tnum mt-3 text-label text-charcoal-900">{t("supported.count", { count: supporters })}</p>}
        </Card>
        <Card variant="muted">
          <ul className="space-y-2 text-caption text-charcoal-900">
            <li>{t("supported.point1")}</li>
            <li>{t("supported.point2")}</li>
            <li>{t("supported.point3")}</li>
          </ul>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button to={`/citizen/issues/${id}`}>{t("supported.view")}</Button>
          <Button variant="outline" to="/citizen">
            {t("submitted.home")}
          </Button>
        </div>
      </main>
    </div>
  );
}
