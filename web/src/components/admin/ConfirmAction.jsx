// Confirmation dialog for every admin decision: says what will happen, asks for the reason when one
// is needed (never sent empty), and shows the server's error in the user's language.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "../Alert.jsx";
import { Button } from "../Button.jsx";
import { Modal } from "../Modal.jsx";
import { Textarea } from "../Textarea.jsx";
import { errorText } from "../../lib/errors.js";

/**
 * reason: "required" | "optional" | false. children: extra fields (their values live in the parent).
 * onConfirm(reason) may throw; the dialog stays open and shows the error. `canConfirm` gates the button.
 */
export function ConfirmAction({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  tone = "primary",
  reason = false,
  reasonLabel,
  reasonHint,
  canConfirm = true,
  onConfirm,
  children,
}) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const missing = reason === "required" && text.trim().length < 3;

  const close = () => {
    if (busy) return;
    setText("");
    setError(null);
    onClose();
  };
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(text.trim() || undefined);
      setText("");
      onClose();
    } catch (err) {
      setError(errorText(t, i18n, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant={tone === "destructive" ? "destructive" : "primary"} loading={busy} disabled={missing || !canConfirm} onClick={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error && <Alert tone="error" className="mb-4" title={error} />}
      {children}
      {reason && (
        <Textarea
          className={children ? "mt-4" : undefined}
          label={reasonLabel ?? t("admin.confirm.reason")}
          hint={reasonHint ?? (reason === "required" ? t("admin.confirm.reasonRequired") : undefined)}
          required={reason === "required"}
          optional={reason === "optional"}
          rows={3}
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
    </Modal>
  );
}
