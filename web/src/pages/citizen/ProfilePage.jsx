import { useNavigate } from "react-router";
import { KeyRound, LogOut, MailCheck, MailWarning, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { LanguageSwitcher } from "../../components/LanguageSwitcher.jsx";
import { PrototypeNotice } from "../../components/PrototypeNotice.jsx";
import { useLogout, useMe } from "../../auth/session.js";

/** Account details (read-only), language, password, logout. In-app notifications only: no SMS/WhatsApp settings. */
export default function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useMe();
  const logout = useLogout();
  if (!user) return null;

  const onLogout = async () => {
    await logout().catch(() => {});
    navigate("/login", { replace: true });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-h1 text-charcoal-900">{t("profile.title")}</h1>

      <Card>
        <div className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-full bg-sage-100 text-sage-600">
            <UserRound aria-hidden="true" className="size-7" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-h3 text-charcoal-900">{user.name}</p>
            <p className="truncate text-caption text-graphite-600">{user.email}</p>
            <p className="text-caption text-graphite-600">{t(`role.${user.role}`)}</p>
          </div>
        </div>
        <div className="mt-4 border-t border-stone-300 pt-4">
          {user.emailVerified ? (
            <p className="flex items-center gap-2 text-label text-success">
              <MailCheck aria-hidden="true" className="size-5" />
              {t("profile.verified")}
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-label text-warning">
                <MailWarning aria-hidden="true" className="size-5" />
                {t("profile.notVerified")}
              </p>
              <Button size="sm" to="/verify-email">
                {t("home.verifyAction")}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-h3 text-charcoal-900">{t("language.label")}</h2>
        <p className="mt-1 text-caption text-graphite-600">{t("profile.languageHint")}</p>
        <LanguageSwitcher className="mt-3" />
      </Card>

      <Card>
        <h2 className="text-h3 text-charcoal-900">{t("profile.notificationsTitle")}</h2>
        <p className="mt-1 text-caption text-graphite-600">{t("profile.notificationsBody")}</p>
      </Card>

      <div className="grid gap-3">
        <Button variant="outline" leftIcon={KeyRound} to="/change-password">
          {t("changePassword.title")}
        </Button>
        <Button variant="destructive-outline" leftIcon={LogOut} onClick={onLogout}>
          {t("common.logout")}
        </Button>
      </div>
      <PrototypeNotice className="pt-4" />
    </div>
  );
}
