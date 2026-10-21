// Submit repair evidence (design/stitch/contractor/submit-evidence). In-app camera capture is
// preferred; the gallery is allowed but the submission is marked "from gallery" for the admin (a
// signal only, D-027). The photo is resized in the browser; the capture time and phone GPS with its
// accuracy are kept. One request ID per draft: a lost connection retries with the same ID, so the
// server never creates two submissions. Not copied from Stitch: checklists, call button, "geofenced"
// claims, daily progress photos.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Crosshair, Images, Layers, LocateFixed, RefreshCw, Send, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { Textarea } from "../../components/Textarea.jsx";
import { useToast } from "../../components/Toast.jsx";
import { FlowHeader } from "../../components/citizen/CitizenLayout.jsx";
import { usePreviewCleanup } from "../../components/citizen/PhotoPicker.jsx";
import { contractorApi, ck, evidenceForm } from "../../api/contractor.js";
import { getDevicePosition } from "../../lib/geolocation.js";
import { PhotoError, preparePhoto } from "../../lib/image.js";
import { errorText } from "../../lib/errors.js";
import { formatDateTime, formatDistance, newRequestId, shortRef } from "../../lib/format.js";
import { retryDelay, retryable } from "../../lib/retry.js";
import { JobMissing, useJob } from "./JobDetailPage.jsx";

function Location({ gps, onRetry }) {
  const { t, i18n } = useTranslation();
  if (gps.state === "locating") {
    return (
      <p className="flex items-center gap-2 text-caption text-charcoal-900">
        <Spinner className="size-4" /> {t("contractor.evidence.locating")}
      </p>
    );
  }
  if (gps.state === "ok") {
    return (
      <p className="flex items-center gap-2 text-caption text-charcoal-900">
        <LocateFixed aria-hidden="true" className="size-4 text-success" />
        {t("contractor.evidence.located", { accuracy: formatDistance(gps.device.accuracyM, i18n.resolvedLanguage) })}
      </p>
    );
  }
  if (gps.state === "idle") return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-caption text-charcoal-900">
      <Crosshair aria-hidden="true" className="size-4" />
      {t(gps.state === "DENIED" ? "contractor.evidence.locationDenied" : "contractor.evidence.locationUnavailable")}
      <Button size="sm" variant="ghost" onClick={onRetry}>
        {t("common.retry")}
      </Button>
    </div>
  );
}

export default function EvidencePage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: job, isPending, error } = useJob(id);
  const requestId = useRef(newRequestId()); // one per draft, kept across retries
  const [photo, setPhoto] = useState(null); // { blob, url, capturedAt, source }
  const [photoError, setPhotoError] = useState(null);
  const [gps, setGps] = useState({ state: "idle", device: null });
  const [note, setNote] = useState("");
  const [overlay, setOverlay] = useState({ on: false, opacity: 0.35 });
  const [phase, setPhase] = useState("edit"); // edit | sending | retrying
  const [progress, setProgress] = useState(0);
  const [retry, setRetry] = useState({ attempt: 0, seconds: 0 });
  const [sendError, setSendError] = useState(null);
  const timer = useRef(null);
  const attempt = useRef(0);
  const cameraInput = useRef(null);
  const galleryInput = useRef(null);
  const lang = i18n.resolvedLanguage;

  usePreviewCleanup(photo?.url);
  useEffect(() => () => clearInterval(timer.current), []);

  const locate = () => {
    setGps({ state: "locating", device: null });
    getDevicePosition()
      .then((device) => setGps({ state: "ok", device }))
      .catch((e) => setGps({ state: e?.code ?? "UNAVAILABLE", device: null }));
  };

  const pick = (source) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    try {
      const p = await preparePhoto(file);
      setPhoto({ blob: p.blob, url: URL.createObjectURL(p.blob), capturedAt: p.capturedAt, source });
      locate(); // where the photo is taken: as close to the capture as a web page can get
    } catch (err) {
      setPhotoError(t(`photo.error.${err instanceof PhotoError ? err.code : "UNREADABLE"}`));
    }
  };

  const send = useCallback(async () => {
    clearInterval(timer.current);
    setPhase((p) => (p === "retrying" ? "retrying" : "sending"));
    setSendError(null);
    setProgress(0);
    try {
      const form = evidenceForm({
        clientRequestId: requestId.current,
        photo: photo.blob,
        note,
        capturedAt: photo.capturedAt,
        captureSource: photo.source,
        device: gps.device,
      });
      const res = await contractorApi.submit(id, form, { onProgress: setProgress });
      qc.setQueryData(ck.job(id), res.job);
      qc.invalidateQueries({ queryKey: ck.jobs });
      toast.show({ tone: "success", title: t("contractor.evidence.sent") });
      navigate(`/contractor/jobs/${id}/submissions`, { replace: true });
    } catch (err) {
      if (retryable(err)) {
        attempt.current += 1;
        const n = attempt.current;
        let seconds = retryDelay(n);
        setRetry({ attempt: n, seconds });
        setPhase("retrying");
        timer.current = setInterval(() => {
          seconds -= 1;
          setRetry({ attempt: n, seconds: Math.max(0, seconds) });
          if (seconds <= 0) {
            clearInterval(timer.current);
            sendRef.current();
          }
        }, 1000);
        return;
      }
      attempt.current = 0;
      setPhase("edit");
      setSendError(errorText(t, i18n, err));
    }
  }, [gps.device, i18n, id, navigate, note, photo, qc, t, toast]);
  const sendRef = useRef(send);
  sendRef.current = send;

  const header = <FlowHeader title={t("contractor.evidence.title")} subtitle={job ? shortRef(job.issueId) : undefined} backTo={`/contractor/jobs/${id}`} />;
  if (isPending) {
    return (
      <div className="min-h-dvh bg-ivory-50">
        {header}
        <div className="flex justify-center py-16 text-teal-700">
          <Spinner />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-dvh bg-ivory-50">
        {header}
        <main className="mx-auto max-w-2xl px-4 py-6">
          <JobMissing error={error} />
        </main>
      </div>
    );
  }
  const allowed = job.stage === "IN_PROGRESS" || job.stage === "REWORK";

  return (
    <div className="min-h-dvh bg-ivory-50">
      {header}
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {!allowed ? (
          <Alert tone="info" title={t(`contractor.evidence.notNow.${job.stage}`, { defaultValue: t("contractor.evidence.notNow.OTHER") })} action={<Button size="sm" to={`/contractor/jobs/${id}`}>{t("common.back")}</Button>} />
        ) : phase === "retrying" ? (
          <Card className="text-center" aria-live="polite">
            <WifiOff aria-hidden="true" className="mx-auto size-10 text-warning" />
            <h2 className="mt-3 text-h2 text-charcoal-900">{t("retry.title")}</h2>
            <p className="mt-2 text-body text-charcoal-900">{retry.seconds > 0 ? t("retry.countdown", { seconds: retry.seconds, attempt: retry.attempt }) : t("retry.sending")}</p>
            <p className="mt-2 text-caption text-graphite-600">{t("contractor.evidence.retrySafe")}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button leftIcon={RefreshCw} onClick={() => send()}>
                {t("retry.now")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  clearInterval(timer.current);
                  attempt.current = 0;
                  setPhase("edit");
                }}
              >
                {t("retry.cancel")}
              </Button>
            </div>
          </Card>
        ) : (
          <>
            {job.stage === "REWORK" && job.submissions.at(-1)?.reviewReason && (
              <Alert tone="error" title={t("contractor.stage.REWORK")}>
                {job.submissions.at(-1).reviewReason}
              </Alert>
            )}
            <Card>
              <h2 className="text-h3 text-charcoal-900">{t("contractor.evidence.photoTitle")}</h2>
              <p className="mt-1 text-caption text-graphite-600">{t("contractor.evidence.photoHint")}</p>
              <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-control border border-stone-300 bg-ivory-50">
                {photo ? (
                  <img src={photo.url} alt={t("contractor.evidence.yourPhoto")} className="size-full object-cover" />
                ) : (
                  job.photo && (
                    <>
                      <img src={job.photo.url} alt={t("contractor.evidence.originalAlt")} className="size-full object-cover opacity-60" />
                      <span className="absolute start-3 top-3 rounded-full bg-forest-900 px-2.5 py-1 text-eyebrow uppercase text-ivory-50">{t("contractor.evidence.reference")}</span>
                    </>
                  )
                )}
                {photo && overlay.on && job.photo && (
                  <img src={job.photo.url} alt="" aria-hidden="true" style={{ opacity: overlay.opacity }} className="pointer-events-none absolute inset-0 size-full object-cover" />
                )}
              </div>
              {photo && job.photo && (
                <div className="mt-3 space-y-2">
                  <label className="flex min-h-11 items-center gap-2 text-label text-charcoal-900">
                    <input type="checkbox" className="size-5 accent-teal-700" checked={overlay.on} onChange={(e) => setOverlay((o) => ({ ...o, on: e.target.checked }))} />
                    <Layers aria-hidden="true" className="size-4" />
                    {t("contractor.evidence.overlay")}
                  </label>
                  {overlay.on && (
                    <label className="block text-caption text-charcoal-900">
                      {t("contractor.evidence.overlayStrength")}
                      <input
                        type="range"
                        min="0.1"
                        max="0.7"
                        step="0.05"
                        value={overlay.opacity}
                        onChange={(e) => setOverlay((o) => ({ ...o, opacity: Number(e.target.value) }))}
                        className="mt-1 block w-full accent-teal-700"
                      />
                    </label>
                  )}
                </div>
              )}
              {photoError && <Alert tone="error" className="mt-3" title={photoError} />}
              {photo && (
                <p className="mt-3 text-caption text-charcoal-900">
                  {photo.source === "GALLERY" ? t("contractor.evidence.fromGallery") : t("contractor.evidence.fromCamera")}
                  {photo.capturedAt && <> · {t("contractor.evidence.takenAt", { when: formatDateTime(photo.capturedAt, lang) })}</>}
                </p>
              )}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Button leftIcon={Camera} variant={photo ? "outline" : "primary"} onClick={() => cameraInput.current?.click()}>
                  {photo ? t("contractor.evidence.retake") : t("contractor.evidence.camera")}
                </Button>
                <Button leftIcon={Images} variant="outline" onClick={() => galleryInput.current?.click()}>
                  {t("contractor.evidence.gallery")}
                </Button>
              </div>
              <p className="mt-2 text-caption text-graphite-600">{t("contractor.evidence.galleryNote")}</p>
              <input ref={cameraInput} data-testid="evidence-camera" type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={pick("CAMERA")} />
              <input ref={galleryInput} data-testid="evidence-gallery" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={pick("GALLERY")} />
              <div className="mt-3">
                <Location gps={gps} onRetry={locate} />
              </div>
            </Card>

            <Card>
              <Textarea label={t("contractor.evidence.note")} optional hint={t("contractor.evidence.noteHint")} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </Card>

            {sendError && <Alert tone="error" title={sendError} />}
            {phase === "sending" && (
              <div aria-live="polite">
                <p className="text-caption text-charcoal-900">{t("contractor.evidence.uploading", { percent: Math.round(progress * 100) })}</p>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-300" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={t("contractor.evidence.progress")}>
                  <div className="h-full bg-teal-700 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              </div>
            )}
            <Button fullWidth leftIcon={Send} loading={phase === "sending"} disabled={!photo || gps.state === "locating"} onClick={() => send()}>
              {t("contractor.evidence.send")}
            </Button>
            <p className="text-center text-caption text-graphite-600">{t("contractor.evidence.afterSend")}</p>
          </>
        )}
      </main>
    </div>
  );
}
