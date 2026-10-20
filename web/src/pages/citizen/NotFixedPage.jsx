import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FlowHeader } from "../../components/citizen/CitizenLayout.jsx";
import { PhotoPicker, usePreviewCleanup } from "../../components/citizen/PhotoPicker.jsx";
import { useIssue } from "../../components/citizen/useIssue.js";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { Textarea } from "../../components/Textarea.jsx";
import { useToast } from "../../components/Toast.jsx";
import { issuesApi, qk } from "../../api/citizen.js";
import { errorText } from "../../lib/errors.js";

export const REASON_MIN = 3;
export const REASON_MAX = 1000;

/**
 * "Not fixed": a reason (required) and an optional photo. It adds DISPUTED for the department admin.
 * It never reopens the issue by itself; only the admin can (brief, D-020).
 */
export default function NotFixedPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: issue, isPending } = useIssue(id);
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState(null);
  const [touched, setTouched] = useState(false);
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
  if (!issue || !issue.feedback?.canRespond) return <Navigate to={`/citizen/issues/${id}`} replace />;

  const tooShort = reason.trim().length < REASON_MIN;
  const send = async () => {
    setTouched(true);
    if (tooShort) return;
    setBusy(true);
    setError(null);
    try {
      await issuesApi.feedback(id, { verdict: "NOT_FIXED", reason, photo: photo?.blob });
      qc.invalidateQueries({ queryKey: qk.issue(id) });
      toast.show({ tone: "success", title: t("notFixed.sent") });
      navigate(`/citizen/issues/${id}`, { replace: true });
    } catch (err) {
      setError(errorText(t, i18n, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-ivory-50">
      <FlowHeader title={t("notFixed.title")} backTo={`/citizen/issues/${id}`} />
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <div className="flex gap-3 rounded-control border border-stone-300 bg-white p-4">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info" />
          <p className="text-caption text-charcoal-900">{t("notFixed.explain")}</p>
        </div>
        {error && <Alert tone="error" title={error} />}
        <Textarea
          label={t("notFixed.reason")}
          required
          rows={5}
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("notFixed.placeholder")}
          hint={t("report.details.languageHint")}
          error={touched && tooShort ? t("notFixed.tooShort") : undefined}
        />
        <div>
          <p className="mb-2 text-label text-charcoal-900">
            {t("notFixed.photo")} <span className="text-caption font-normal text-graphite-600">{t("common.optional")}</span>
          </p>
          <PhotoPicker value={photo} onChange={setPhoto} label={t("notFixed.photo")} />
        </div>
        <Button fullWidth loading={busy} onClick={send}>
          {t("notFixed.submit")}
        </Button>
      </main>
    </div>
  );
}
