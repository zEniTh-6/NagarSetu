import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "../../components/AuthLayout.jsx";
import { PasswordInput } from "../../components/PasswordInput.jsx";
import { Button } from "../../components/Button.jsx";
import { Alert } from "../../components/Alert.jsx";
import { useToast } from "../../components/Toast.jsx";
import { authApi, PASSWORD_MIN } from "../../api/auth.js";
import { ApiError } from "../../api/client.js";
import { homePathFor, useLogout, useMe, useSetMe } from "../../auth/session.js";
import { errorText } from "../../lib/errors.js";
import { newPasswordErrors } from "../../lib/passwords.js";

// Forced on an admin's first login (mustChangePassword); also usable by anyone signed in.
export default function ChangePasswordPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useMe();
  const setMe = useSetMe();
  const logout = useLogout();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const required = !!user?.mustChangePassword;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const local = newPasswordErrors(t, password, confirm);
    if (!current) local.current = t("changePassword.currentRequired");
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      const { user: updated } = await authApi.changePassword({ currentPassword: current, newPassword: password });
      setMe(updated);
      toast.show({ tone: "success", title: t("changePassword.done") });
      navigate(homePathFor(updated), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "WRONG_CURRENT_PASSWORD") setErrors({ current: t("errors.WRONG_CURRENT_PASSWORD") });
      else if (err instanceof ApiError && err.code === "PASSWORD_UNCHANGED") setErrors({ newPassword: t("errors.PASSWORD_UNCHANGED") });
      else setError(err);
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    await logout().catch(() => {});
    navigate("/login", { replace: true });
  };

  return (
    <AuthLayout
      icon={LockKeyhole}
      title={required ? t("changePassword.requiredTitle") : t("changePassword.title")}
      subtitle={required ? t("changePassword.requiredBody") : t("changePassword.subtitle")}
      footer={
        <div className="text-center">
          {required ? (
            <Button variant="ghost" size="sm" onClick={onLogout}>
              {t("common.logout")}
            </Button>
          ) : (
            user && (
              <Button variant="ghost" size="sm" to={homePathFor(user)}>
                {t("common.cancel")}
              </Button>
            )
          )}
        </div>
      }
    >
      {user && (
        <div className="mb-5 flex items-center gap-3 rounded-control border border-stone-300 bg-ivory-50 p-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-sage-100 text-sage-600">
            <UserRound aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-label text-charcoal-900">{user.name}</p>
            <p className="truncate text-caption text-graphite-600">
              {t(`role.${user.role}`)} · {user.email}
            </p>
          </div>
        </div>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {error && <Alert tone="error" title={errorText(t, i18n, error)} />}
        <PasswordInput
          label={required ? t("fields.initialPassword") : t("fields.currentPassword")}
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.current}
        />
        <PasswordInput
          label={t("fields.newPassword")}
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.newPassword}
          hint={t("password.ruleNew", { min: PASSWORD_MIN })}
        />
        <PasswordInput
          label={t("fields.confirmPassword")}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        <Button type="submit" fullWidth loading={busy} rightIcon={ArrowRight}>
          {t("changePassword.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
