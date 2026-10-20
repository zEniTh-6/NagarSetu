import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FlowHeader } from "../../components/citizen/CitizenLayout.jsx";
import { PhotoPicker, usePreviewCleanup } from "../../components/citizen/PhotoPicker.jsx";
import { useIssue } from "../../components/citizen/useIssue.js";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { useToast } from "../../components/Toast.jsx";
import { issuesApi, qk } from "../../api/citizen.js";
import { errorText } from "../../lib/errors.js";

/** The AI suggested the photo doesn't show the problem (INVALID): take a new one. Never a rejection (D-010). */
export default function RetakePage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: issue, isPending } = useIssue(id);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  usePreviewCleanup(photo?.url);

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-teal-700">
        <Spinner />
      </div>
    );
  }
  if (!issue || issue.validation?.state !== "RETAKE_REQUESTED") return <Navigate to={`/citizen/issues/${id}`} replace />;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const { issue: updated } = await issuesApi.retakePhoto(id, photo.blob, photo.capturedAt);
      qc.setQueryData(qk.issue(id), (old) => ({ ...old, ...updated }));
      qc.invalidateQueries({ queryKey: qk.issue(id) });
      toast.show({ tone: "success", title: t("retake.sent") });
      navigate(`/citizen/issues/${id}`, { replace: true });
    } catch (err) {
      setError(errorText(t, i18n, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-ivory-50">
      <FlowHeader title={t("retake.title")} backTo={`/citizen/issues/${id}`} />
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <Alert tone="warning" title={t("validation.retakeTitle")}>
          <p>{t("retake.body")}</p>
          {issue.validation.reason && (
            <p className="mt-1">
              <span className="font-semibold">{t("ai.suggestion", { verdict: t("ai.INVALID") })}:</span> {issue.validation.reason}
            </p>
          )}
        </Alert>
        {issue.photo && !photo && (
          <figure>
            <img src={issue.photo.url} alt={t("retake.current")} className="aspect-[4/3] w-full rounded-card border border-stone-300 object-cover opacity-80" />
            <figcaption className="mt-1 text-caption text-graphite-600">{t("retake.current")}</figcaption>
          </figure>
        )}
        <PhotoPicker value={photo} onChange={setPhoto} error={error} label={t("retake.new")} />
        <Button fullWidth disabled={!photo} loading={busy} onClick={send}>
          {t("retake.submit")}
        </Button>
        <p className="text-center text-caption text-graphite-600">{t("retake.keep")}</p>
      </main>
    </div>
  );
}
