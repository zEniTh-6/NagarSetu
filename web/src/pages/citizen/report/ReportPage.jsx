// Report flow: photo → location → details → review → (duplicate sheet) → submit.
// One clientRequestId per draft: a retry after a lost connection can never create a second report.
// No offline queue (future scope): leaving the page drops the draft.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, MailWarning, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FlowHeader } from "../../../components/citizen/CitizenLayout.jsx";
import { usePreviewCleanup } from "../../../components/citizen/PhotoPicker.jsx";
import { Button } from "../../../components/Button.jsx";
import { Card } from "../../../components/Card.jsx";
import { issuesApi, qk, reportForm } from "../../../api/citizen.js";
import { ApiError } from "../../../api/client.js";
import { ME_KEY, useMe } from "../../../auth/session.js";
import { errorText } from "../../../lib/errors.js";
import { newRequestId } from "../../../lib/format.js";
import { DetailsStep, LocationStep, PhotoStep, ReviewStep } from "./steps.jsx";
import { DuplicateSheet } from "./DuplicateSheet.jsx";

const STEPS = 4;
/** Waits between automatic retries after a lost connection (seconds). */
export const RETRY_DELAYS_S = [2, 4, 8, 15, 30];

const PHOTO_ERRORS = ["PHOTO_REQUIRED", "UNSUPPORTED_IMAGE", "UNREADABLE_IMAGE", "IMAGE_TOO_SMALL", "PHOTO_TOO_LARGE"];
const retryable = (err) => err instanceof ApiError && (err.code === "NETWORK_ERROR" || err.status >= 500);

export const emptyDraft = () => ({
  clientRequestId: newRequestId(),
  photo: null, // { blob, url, capturedAt, width, height }
  location: null, // { lat, lng } — the pin
  device: null, // { lat, lng, accuracyM } — "use my location"
  addressText: "",
  categoryKey: "",
  description: "",
});

/** Unverified citizens must verify their email before reporting (brief: "verify before reporting"). */
function VerifyGate() {
  const { t } = useTranslation();
  const { user } = useMe();
  return (
    <div className="min-h-dvh bg-ivory-50">
      <FlowHeader title={t("report.title")} backTo="/citizen" />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Card className="text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-card bg-warning-tint text-warning">
            <MailWarning aria-hidden="true" className="size-7" />
          </div>
          <h2 className="text-h2 text-charcoal-900">{t("gate.title")}</h2>
          <p className="mt-2 text-body text-graphite-600">{t("gate.body", { email: user?.email ?? "" })}</p>
          <ul className="mx-auto mt-5 max-w-sm space-y-2 text-start text-caption text-charcoal-900">
            {["gate.why1", "gate.why2"].map((k) => (
              <li key={k} className="flex gap-2">
                <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-sage-600" />
                {t(k)}
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-3">
            <Button fullWidth to="/verify-email">
              {t("gate.verify")}
            </Button>
            <Button fullWidth variant="outline" to="/citizen">
              {t("gate.later")}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** "Connection lost, retrying": same clientRequestId every time. */
function RetryingState({ attempt, seconds, onRetryNow, onCancel }) {
  const { t } = useTranslation();
  return (
    <Card className="text-center" role="status" aria-live="polite">
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-card bg-warning-tint text-warning">
        <CloudOff aria-hidden="true" className="size-7" />
      </div>
      <h2 className="text-h2 text-charcoal-900">{t("retry.title")}</h2>
      <p className="mt-2 text-body text-graphite-600">{t("retry.body")}</p>
      <p className="tnum mt-4 text-label text-charcoal-900">
        {seconds > 0 ? t("retry.countdown", { seconds, attempt }) : t("retry.sending")}
      </p>
      <p className="mt-2 text-caption text-graphite-600">{t("retry.safe")}</p>
      <div className="mt-6 space-y-3">
        <Button fullWidth onClick={onRetryNow} disabled={seconds === 0}>
          {t("retry.now")}
        </Button>
        <Button fullWidth variant="outline" onClick={onCancel}>
          {t("retry.cancel")}
        </Button>
      </div>
    </Card>
  );
}

export default function ReportPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useMe();
  const [draft, setDraft] = useState(emptyDraft);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({}); // per step: { 1: "…", 2: "…" }
  const [phase, setPhase] = useState("edit"); // edit | checking | duplicates | sending | retrying
  const [candidates, setCandidates] = useState([]);
  const [retry, setRetry] = useState({ attempt: 0, seconds: 0 });
  const timer = useRef(null);
  const attemptRef = useRef(0);
  const declinedRef = useRef([]);

  usePreviewCleanup(draft.photo?.url);
  useEffect(() => () => clearInterval(timer.current), []);

  const update = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
  };

  const goTo = (s) => {
    setStep(s);
    setPhase("edit");
    window.scrollTo?.({ top: 0 });
  };

  const send = useCallback(async () => {
    clearInterval(timer.current);
    setPhase((p) => (p === "retrying" ? "retrying" : "sending"));
    setRetry((r) => ({ ...r, seconds: 0 }));
    try {
      const form = reportForm({
        clientRequestId: draft.clientRequestId,
        photo: draft.photo.blob,
        capturedAt: draft.photo.capturedAt,
        categoryKey: draft.categoryKey,
        description: draft.description,
        lat: draft.location.lat,
        lng: draft.location.lng,
        addressText: draft.addressText,
        device: draft.device,
        duplicateCandidateIds: declinedRef.current,
      });
      const { issue } = await issuesApi.create(form);
      qc.invalidateQueries({ queryKey: qk.mine });
      navigate(`/citizen/report/submitted/${issue.id}`, { replace: true });
    } catch (err) {
      if (retryable(err)) {
        attemptRef.current += 1;
        const attempt = attemptRef.current;
        let seconds = RETRY_DELAYS_S[Math.min(attempt - 1, RETRY_DELAYS_S.length - 1)];
        setRetry({ attempt, seconds });
        setPhase("retrying");
        clearInterval(timer.current);
        timer.current = setInterval(() => {
          seconds -= 1;
          setRetry({ attempt, seconds: Math.max(0, seconds) });
          if (seconds <= 0) {
            clearInterval(timer.current);
            sendRef.current();
          }
        }, 1000);
        return;
      }
      attemptRef.current = 0;
      setRetry({ attempt: 0, seconds: 0 });
      const msg = errorText(t, i18n, err);
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        qc.invalidateQueries({ queryKey: ME_KEY });
      } else if (err instanceof ApiError && PHOTO_ERRORS.includes(err.code)) {
        setErrors({ 1: msg });
        goTo(1);
      } else if (err instanceof ApiError && err.code === "OUTSIDE_SERVICE_AREA") {
        setErrors({ 2: msg });
        goTo(2);
      } else if (err instanceof ApiError && (err.code === "VALIDATION_FAILED" || err.code === "UNKNOWN_CATEGORY")) {
        setErrors({ 3: msg });
        goTo(3);
      } else {
        setErrors({ 4: msg });
        setPhase("edit");
      }
    }
  }, [draft, i18n, navigate, qc, t]);
  const sendRef = useRef(send);
  sendRef.current = send;

  // Duplicate check first. Any failure there never blocks the report: just submit.
  const submit = async () => {
    setErrors({});
    setPhase("checking");
    let found = [];
    try {
      const res = await issuesApi.duplicateCheck({
        categoryKey: draft.categoryKey,
        description: draft.description,
        lat: draft.location.lat,
        lng: draft.location.lng,
      });
      if (res?.checked) found = res.candidates ?? [];
    } catch {
      found = [];
    }
    if (found.length) {
      setCandidates(found);
      setPhase("duplicates");
      return;
    }
    declinedRef.current = [];
    send();
  };

  const submitAnyway = () => {
    declinedRef.current = candidates.map((c) => c.id);
    setCandidates([]);
    send();
  };

  if (user && !user.emailVerified) return <VerifyGate />;

  const back = () => (step > 1 && phase === "edit" ? goTo(step - 1) : navigate(-1));
  const busy = phase === "checking" || phase === "sending";

  return (
    <div className="min-h-dvh bg-ivory-50">
      <FlowHeader title={t("report.title")} subtitle={t(`report.stepName.${step}`)} onBack={back} step={step} steps={STEPS} />
      <main className="mx-auto max-w-2xl px-4 py-6">
        {phase === "retrying" ? (
          <RetryingState
            attempt={retry.attempt}
            seconds={retry.seconds}
            onRetryNow={() => send()}
            onCancel={() => {
              clearInterval(timer.current);
              attemptRef.current = 0;
              setRetry({ attempt: 0, seconds: 0 });
              setPhase("edit");
            }}
          />
        ) : (
          <>
            {step === 1 && <PhotoStep draft={draft} update={update} error={errors[1]} onNext={() => goTo(2)} />}
            {step === 2 && <LocationStep draft={draft} update={update} error={errors[2]} onNext={() => goTo(3)} />}
            {step === 3 && <DetailsStep draft={draft} update={update} error={errors[3]} onNext={() => goTo(4)} />}
            {step === 4 && <ReviewStep draft={draft} goTo={goTo} error={errors[4]} busy={busy} onSubmit={submit} />}
          </>
        )}
      </main>
      <DuplicateSheet
        open={phase === "duplicates"}
        candidates={candidates}
        onClose={() => setPhase("edit")}
        onSubmitAnyway={submitAnyway}
        onSupported={(issueId, supporters) => navigate(`/citizen/report/supported/${issueId}`, { replace: true, state: { supporters } })}
      />
    </div>
  );
}
