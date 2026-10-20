import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { ArrowRight, Clock, MailCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { AuthLayout } from "../../components/AuthLayout.jsx";
import { OtpInput } from "../../components/OtpInput.jsx";
import { Button } from "../../components/Button.jsx";
import { Alert } from "../../components/Alert.jsx";
import { useToast } from "../../components/Toast.jsx";
import { authApi } from "../../api/auth.js";
import { ApiError } from "../../api/client.js";
import { ME_KEY, useMe } from "../../auth/session.js";
import { errorText } from "../../lib/errors.js";
import { formatMmSs, useCountdown } from "../../lib/useCountdown.js";

const RESEND_COOLDOWN_S = 60; // server: OTP.resendCooldownMs

export default function VerifyEmailPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useMe();
  const fromSignup = location.state?.fromSignup === true;
  const otpSent = location.state?.otpSent !== false;

  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendAt, setResendAt] = useState(() => (fromSignup && otpSent ? Date.now() + RESEND_COOLDOWN_S * 1000 : null));
  const wait = useCountdown(resendAt);

  const verify = async (value = code) => {
    if (value.length !== 6) {
      setError("incomplete");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await authApi.verifyEmail(value);
      await qc.invalidateQueries({ queryKey: ME_KEY });
      toast.show({ tone: "success", title: t("otp.verified") });
      navigate("/citizen", { replace: true });
    } catch (err) {
      setError(err);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      const res = await authApi.resendOtp();
      if (res?.alreadyVerified) {
        await qc.invalidateQueries({ queryKey: ME_KEY });
        navigate("/citizen", { replace: true });
        return;
      }
      toast.show({ tone: "success", title: t("otp.resent") });
      setResendAt(Date.now() + RESEND_COOLDOWN_S * 1000);
    } catch (err) {
      if (err instanceof ApiError && err.code === "OTP_COOLDOWN") {
        setResendAt(Date.now() + (err.details?.retryAfterSeconds ?? RESEND_COOLDOWN_S) * 1000);
      } else {
        setError(err);
      }
    } finally {
      setResending(false);
    }
  };

  if (user?.emailVerified && !busy) return <Navigate to="/citizen" replace />;

  const message =
    error === "incomplete"
      ? t("otp.incomplete")
      : error instanceof ApiError && error.code === "OTP_INVALID"
        ? t("errors.OTP_INVALID", { count: error.details?.attemptsLeft ?? 0 })
        : error
          ? errorText(t, i18n, error)
          : null;

  return (
    <AuthLayout icon={MailCheck} title={t("otp.title")} subtitle={t("otp.subtitle")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          verify();
        }}
        noValidate
        className="space-y-5"
      >
        <p className="truncate rounded-full border border-stone-300 bg-ivory-50 px-4 py-2 text-center text-label text-charcoal-900">
          {user?.email}
        </p>
        {!otpSent && <Alert tone="warning" title={t("otp.notSent")} />}
        <p id="otp-label" className="sr-only">
          {t("otp.codeLabel")}
        </p>
        <OtpInput value={code} onChange={setCode} labelledBy="otp-label" error={!!message} disabled={busy} autoFocus onComplete={verify} />
        {message && <Alert tone="error" title={message} />}

        <Button type="submit" fullWidth loading={busy} rightIcon={ArrowRight}>
          {t("otp.submit")}
        </Button>

        <div className="text-center">
          {wait > 0 ? (
            <p className="inline-flex items-center gap-2 text-caption text-graphite-600" aria-live="off">
              <Clock aria-hidden="true" className="size-4" />
              {t("otp.resendIn")} <span className="tnum font-semibold text-charcoal-900">{formatMmSs(wait)}</span>
            </p>
          ) : (
            <Button variant="ghost" size="sm" onClick={resend} loading={resending}>
              {t("otp.resend")}
            </Button>
          )}
        </div>
      </form>
      <p className="mt-6 border-t border-stone-300 pt-5 text-center text-caption text-graphite-600">{t("otp.later")}</p>
      <div className="mt-3 text-center">
        <Button variant="ghost" size="sm" to="/citizen">
          {t("otp.skip")}
        </Button>
      </div>
    </AuthLayout>
  );
}
