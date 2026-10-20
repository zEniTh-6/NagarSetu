import { useState } from "react";
import { KeyRound, MailCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "../../components/AuthLayout.jsx";
import { Input } from "../../components/Input.jsx";
import { Button } from "../../components/Button.jsx";
import { Alert } from "../../components/Alert.jsx";
import { authApi } from "../../api/auth.js";
import { ApiError } from "../../api/client.js";
import { errorText } from "../../lib/errors.js";

// The reset link goes by email only (no SMS). The answer is the same whether or not the email exists.
export default function ForgotPasswordPage() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("email");
      return;
    }
    setBusy(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout backTo="/login" backLabel={t("common.backToLogin")} icon={MailCheck} title={t("forgot.sentTitle")} subtitle={t("forgot.sentBody", { minutes: 30 })}>
        <Button variant="outline" fullWidth to="/login">
          {t("common.backToLogin")}
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout backTo="/login" backLabel={t("common.backToLogin")} icon={KeyRound} title={t("forgot.title")} subtitle={t("forgot.subtitle")}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {error instanceof ApiError && <Alert tone="error" title={errorText(t, i18n, error)} />}
        <Input
          label={t("fields.email")}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error === "email" ? t("signup.invalid.email") : undefined}
        />
        <Button type="submit" fullWidth loading={busy}>
          {t("forgot.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
