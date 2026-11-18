import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { KeyRound, LinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { AuthLayout } from "../../components/AuthLayout.jsx";
import { PasswordInput } from "../../components/PasswordInput.jsx";
import { Button } from "../../components/Button.jsx";
import { Alert } from "../../components/Alert.jsx";
import { authApi, PASSWORD_MIN, TOKEN_FORMAT } from "../../api/auth.js";
import { ApiError } from "../../api/client.js";
import { ME_KEY } from "../../auth/session.js";
import { errorText } from "../../lib/errors.js";
import { newPasswordErrors } from "../../lib/passwords.js";

// Opened from the emailed link: /reset-password?token=…  (no mockup; follows forgot-password).
export default function ResetPasswordPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const linkBroken = !TOKEN_FORMAT.test(token) || (error instanceof ApiError && error.code === "RESET_LINK_INVALID");

  if (linkBroken) {
    return (
      <AuthLayout backTo="/login" backLabel={t("common.backToLogin")} icon={LinkIcon} title={t("reset.invalidTitle")} subtitle={t("errors.RESET_LINK_INVALID")}>
        <Button fullWidth to="/forgot-password">
          {t("reset.requestNew")}
        </Button>
      </AuthLayout>
    );
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const local = newPasswordErrors(t, password, confirm);
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await authApi.resetPassword({ token, newPassword: password });
      // The server ended every session; start clean.
      qc.clear();
      qc.setQueryData(ME_KEY, null);
      navigate("/login?reset=1", { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout backTo="/login" backLabel={t("common.backToLogin")} icon={KeyRound} title={t("reset.title")} subtitle={t("reset.subtitle")}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {error && <Alert tone="error" title={errorText(t, i18n, error)} />}
        <PasswordInput
          label={t("fields.newPassword")}
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.newPassword}
          hint={t("password.rule", { min: PASSWORD_MIN })}
        />
        <PasswordInput
          label={t("fields.confirmPassword")}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        <Button type="submit" fullWidth loading={busy}>
          {t("reset.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
