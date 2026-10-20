import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "../../components/AuthLayout.jsx";
import { Input } from "../../components/Input.jsx";
import { PasswordInput } from "../../components/PasswordInput.jsx";
import { Button } from "../../components/Button.jsx";
import { Alert } from "../../components/Alert.jsx";
import { authApi } from "../../api/auth.js";
import { ApiError } from "../../api/client.js";
import { afterLoginPath, useSetMe } from "../../auth/session.js";
import { errorText } from "../../lib/errors.js";

// One login for every role; the role comes from the account (no role picker, no "remember device").
export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setMe = useSetMe();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const expired = params.get("expired") === "1";
  const reset = params.get("reset") === "1";

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("missing");
      return;
    }
    setBusy(true);
    try {
      const { user } = await authApi.login({ email: email.trim(), password });
      setMe(user);
      navigate(afterLoginPath(user, params.get("next")), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "ACCOUNT_LOCKED") {
        navigate(`/account-blocked?reason=locked&minutes=${err.details?.retryAfterMinutes ?? 15}`);
        return;
      }
      if (err instanceof ApiError && err.code === "ACCOUNT_DEACTIVATED") {
        navigate("/account-blocked?reason=deactivated");
        return;
      }
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const invalid = error instanceof ApiError && (error.code === "INVALID_CREDENTIALS" || error.code === "VALIDATION_FAILED");

  return (
    <AuthLayout heroOnMobile title={t("login.title")} subtitle={t("login.subtitle")}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {expired && !error && <Alert tone="info" title={t("login.sessionExpired")} />}
        {reset && !error && <Alert tone="success" title={t("login.passwordReset")} />}
        {error && (
          <Alert
            tone="error"
            title={
              error === "missing"
                ? t("login.missing")
                : invalid
                  ? t("errors.INVALID_CREDENTIALS")
                  : errorText(t, i18n, error)
            }
          >
            {invalid && t("login.invalidHelp")}
          </Alert>
        )}

        <Input
          label={t("fields.email")}
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={invalid || undefined}
        />
        <PasswordInput
          label={t("fields.password")}
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={invalid || undefined}
          labelAside={
            <Link to="/forgot-password" className="text-label text-teal-700 underline-offset-4 hover:underline">
              {t("login.forgot")}
            </Link>
          }
        />

        <Button type="submit" fullWidth loading={busy} rightIcon={ArrowRight}>
          {t("login.submit")}
        </Button>
      </form>

      <p className="mt-6 border-t border-stone-300 pt-5 text-center text-body text-graphite-600">
        {t("login.newCitizen")}{" "}
        <Link to="/signup" className="font-semibold text-teal-700 underline-offset-4 hover:underline">
          {t("login.createAccount")}
        </Link>
      </p>

      <div className="mt-5 flex gap-3 rounded-control border border-stone-300 bg-ivory-50 p-4">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-sage-600" />
        <p className="text-caption text-charcoal-900">{t("login.staffNote")}</p>
      </div>
    </AuthLayout>
  );
}
