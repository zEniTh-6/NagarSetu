import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "../../components/AuthLayout.jsx";
import { Input } from "../../components/Input.jsx";
import { PasswordInput } from "../../components/PasswordInput.jsx";
import { Button } from "../../components/Button.jsx";
import { Alert } from "../../components/Alert.jsx";
import { authApi, PASSWORD_MIN } from "../../api/auth.js";
import { ApiError, fieldErrors } from "../../api/client.js";
import { useSetMe } from "../../auth/session.js";
import { errorText } from "../../lib/errors.js";
import { passwordProblem } from "../../lib/passwords.js";

// Citizens only: there is no role field (the server rejects unknown fields too).
export default function SignupPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setMe = useSetMe();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    const out = {};
    if (form.name.trim().length < 2) out.name = t("signup.invalid.name");
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) out.email = t("signup.invalid.email");
    if (form.phone.trim() && (!/^\+?[\d\s()-]+$/.test(form.phone.trim()) || form.phone.replace(/\D/g, "").length < 10)) {
      out.phone = t("signup.invalid.phone");
    }
    const pw = passwordProblem(form.password);
    if (pw) out.password = t(`password.${pw}`, { min: PASSWORD_MIN });
    return out;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const local = validate();
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    const email = form.email.trim();
    try {
      const { otpSent } = await authApi.signup({
        name: form.name.trim(),
        email,
        password: form.password,
        phone: form.phone.trim() || undefined,
      });
      // Signup doesn't start a session; log in with what was just typed so the OTP can be checked.
      try {
        const { user } = await authApi.login({ email, password: form.password });
        setMe(user);
        navigate("/verify-email", { replace: true, state: { otpSent, fromSignup: true } });
      } catch {
        navigate("/login", { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_TAKEN") {
        setErrors({ email: t("errors.EMAIL_TAKEN") });
      } else if (err instanceof ApiError && err.code === "VALIDATION_FAILED") {
        const fe = fieldErrors(err);
        setErrors(Object.fromEntries(Object.keys(fe).map((k) => [k, t(`signup.invalid.${k}`, { defaultValue: t("errors.VALIDATION_FAILED") })])));
      } else {
        setFormError(err);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout backTo="/login" backLabel={t("common.backToLogin")} title={t("signup.title")} subtitle={t("signup.subtitle")}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Alert tone="info" title={t("signup.citizensOnlyTitle")}>
          {t("signup.citizensOnly")}
        </Alert>
        {formError && <Alert tone="error" title={errorText(t, i18n, formError)} />}

        <Input label={t("fields.name")} name="name" autoComplete="name" required value={form.name} onChange={set("name")} error={errors.name} />
        <Input
          label={t("fields.email")}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          required
          value={form.email}
          onChange={set("email")}
          error={errors.email}
          hint={t("signup.emailHint")}
        />
        <Input
          label={t("fields.phone")}
          type="tel"
          name="phone"
          autoComplete="tel"
          inputMode="tel"
          optional
          value={form.phone}
          onChange={set("phone")}
          error={errors.phone}
          hint={t("signup.phoneHint")}
        />
        <PasswordInput
          label={t("fields.createPassword")}
          name="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={set("password")}
          error={errors.password}
          hint={t("password.rule", { min: PASSWORD_MIN })}
        />

        <Button type="submit" fullWidth loading={busy} rightIcon={ArrowRight}>
          {t("signup.submit")}
        </Button>
      </form>
      <p className="mt-6 text-center text-body text-graphite-600">
        {t("signup.haveAccount")}{" "}
        <Link to="/login" className="font-semibold text-teal-700 underline-offset-4 hover:underline">
          {t("signup.login")}
        </Link>
      </p>
    </AuthLayout>
  );
}
