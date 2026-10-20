import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, HardHat, LinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "../../components/AuthLayout.jsx";
import { PasswordInput } from "../../components/PasswordInput.jsx";
import { Button } from "../../components/Button.jsx";
import { Alert } from "../../components/Alert.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { invitesApi, PASSWORD_MIN, TOKEN_FORMAT } from "../../api/auth.js";
import { ApiError } from "../../api/client.js";
import { useSetMe } from "../../auth/session.js";
import { errorText } from "../../lib/errors.js";
import { newPasswordErrors } from "../../lib/passwords.js";

// Contractor invite link from an admin: /invite/:token. Works once; the contractor sets a password.
export default function InvitePage() {
  const { t, i18n } = useTranslation();
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const setMe = useSetMe();
  const validFormat = TOKEN_FORMAT.test(token);

  const invite = useQuery({
    queryKey: ["invite", token],
    queryFn: () => invitesApi.get(token).then((r) => r.invite),
    enabled: validFormat,
    retry: false,
    staleTime: Infinity,
  });

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const deadError =
    !validFormat ? "INVITE_NOT_FOUND"
    : invite.error instanceof ApiError && ["INVITE_NOT_FOUND", "INVITE_USED", "INVITE_EXPIRED"].includes(invite.error.code) ? invite.error.code
    : error instanceof ApiError && ["INVITE_USED", "INVITE_EXPIRED", "INVITE_NOT_FOUND"].includes(error.code) ? error.code
    : null;

  if (deadError) {
    return (
      <AuthLayout backTo="/login" backLabel={t("common.backToLogin")} icon={LinkIcon} title={t("invite.deadTitle")} subtitle={t(`errors.${deadError}`)}>
        <p className="mb-5 text-body text-graphite-600">{t("invite.askAdmin")}</p>
        <Button variant="outline" fullWidth to="/login">
          {t("common.backToLogin")}
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
      const { user } = await invitesApi.accept(token, password);
      setMe(user);
      navigate("/contractor", { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout icon={HardHat} title={t("invite.title")} subtitle={t("invite.subtitle")}>
      {invite.isPending ? (
        <div className="flex justify-center py-8 text-teal-700">
          <Spinner />
        </div>
      ) : invite.error ? (
        <Alert tone="error" title={errorText(t, i18n, invite.error)} action={<Button size="sm" variant="outline" onClick={() => invite.refetch()}>{t("common.retry")}</Button>} />
      ) : (
        <>
          <section aria-labelledby="invite-step1" className="mb-6 rounded-control border border-stone-300 bg-ivory-50 p-4">
            <h2 id="invite-step1" className="text-eyebrow uppercase text-graphite-600">
              {t("invite.step1")}
            </h2>
            <dl className="mt-2 space-y-1">
              <div>
                <dt className="sr-only">{t("fields.name")}</dt>
                <dd className="text-h3 text-charcoal-900">{invite.data.name}</dd>
              </div>
              <div>
                <dt className="sr-only">{t("fields.email")}</dt>
                <dd className="break-all text-caption text-graphite-600">{invite.data.email}</dd>
              </div>
            </dl>
            <p className="mt-2 text-caption text-graphite-600">
              {t("invite.expires", { date: new Date(invite.data.expiresAt).toLocaleString(i18n.resolvedLanguage) })}
            </p>
          </section>

          <h2 className="mb-4 text-eyebrow uppercase text-graphite-600">{t("invite.step2")}</h2>
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            {error && <Alert tone="error" title={errorText(t, i18n, error)} />}
            {/* Lets password managers save the login under the right email. */}
            <input type="email" name="username" autoComplete="username" value={invite.data.email} readOnly hidden />
            <PasswordInput
              label={t("fields.createPassword")}
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
            <Button type="submit" fullWidth loading={busy} rightIcon={ArrowRight}>
              {t("invite.submit")}
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
