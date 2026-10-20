import { useEffect, useRef, useState } from "react";

/** Revokes a photo preview URL when it is replaced or its owner unmounts. Call it where the photo is stored. */
export function usePreviewCleanup(url) {
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
}
import { Camera, ImagePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../Button.jsx";
import { Alert } from "../Alert.jsx";
import { PhotoError, preparePhoto } from "../../lib/image.js";

/**
 * Camera or gallery → resized JPEG. value: { blob, url, capturedAt } | null.
 * The owner of `value` revokes its preview URL (usePreviewCleanup).
 */
export function PhotoPicker({ value, onChange, error: outerError, label }) {
  const { t } = useTranslation();
  const camera = useRef(null);
  const gallery = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const p = await preparePhoto(file);
      onChange({ ...p, url: URL.createObjectURL(p.blob) });
    } catch (err) {
      setError(err instanceof PhotoError ? err.code : "UNREADABLE");
    } finally {
      setBusy(false);
    }
  };

  const message = error ? t(`photo.error.${error}`) : outerError;
  return (
    <div className="space-y-4">
      {value?.url ? (
        <img src={value.url} alt={label ?? t("photo.preview")} className="aspect-[4/3] w-full rounded-card border border-stone-300 object-cover" />
      ) : (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-field-border bg-white text-graphite-600">
          <Camera aria-hidden="true" className="size-10" />
          <p className="px-6 text-center text-caption">{t("photo.empty")}</p>
        </div>
      )}
      {message && <Alert tone="error" title={message} />}
      <div className="grid gap-3">
        <Button leftIcon={Camera} loading={busy} onClick={() => camera.current?.click()}>
          {value ? t("photo.retakeCamera") : t("photo.camera")}
        </Button>
        <Button variant="outline" leftIcon={ImagePlus} disabled={busy} onClick={() => gallery.current?.click()}>
          {t("photo.gallery")}
        </Button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} data-testid="photo-camera" />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="hidden" onChange={pick} data-testid="photo-gallery" />
    </div>
  );
}
