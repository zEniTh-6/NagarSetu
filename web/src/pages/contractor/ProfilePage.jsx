// Contractor profile: own details (read-only: an admin changes them), language, password, logout.
// In-app alerts only: no SMS/WhatsApp settings.
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { HardHat, KeyRound, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { LanguageSwitcher } from "../../components/LanguageSwitcher.jsx";
import { PrototypeNotice } from "../../components/PrototypeNotice.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { useLogout } from "../../auth/session.js";
import { contractorApi, ck } from "../../api/contractor.js";
import { errorText } from "../../lib/errors.js";

export default function ContractorProfilePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const logout = useLogout();
  const q = useQuery({ queryKey: ck.me, queryFn: () => contractorApi.me().then((r) => r.contractor) });
  const onLogout = async () => {
    await logout().catch(() => {});
    navigate("/login", { replace: true });
  };
  const me = q.data;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-h1 text-charcoal-900">{t("profile.title")}</h1>
      <Card>
        {q.isPending ? (
          <Spinner />
        ) : q.error ? (
          <Alert tone="error" title={errorText(t, i18n, q.error)} />
        ) : (
          <>
            <div className="flex items-center gap-4">
              <span className="flex size-14 items-center justify-center rounded-full bg-sage-100 text-sage-600">
                <HardHat aria-hidden="true" className="size-7" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-h3 text-charcoal-900">{me.name}</p>
                <p className="text-caption text-graphite-600">{t("role.CONTRACTOR")}</p>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 border-t border-stone-300 pt-4 text-body sm:grid-cols-2">
              {[
                ["phone", me.phone],
                ["email", me.email],
                ["workType", me.workType],
                ["licence", me.licenceNumber],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-caption text-graphite-600">{t(`contractor.profile.${k}`)}</dt>
                  <dd className="break-words text-charcoal-900">{v || "—"}</dd>
                </div>
              ))}
              <div>
                <dt className="text-caption text-graphite-600">{t("contractor.profile.activeJobs")}</dt>
                <dd className="tnum text-charcoal-900">{me.activeJobs}</dd>
              </div>
              <div>
                <dt className="text-caption text-graphite-600">{t("contractor.profile.completedJobs")}</dt>
                <dd className="tnum text-charcoal-900">{me.completedJobs}</dd>
              </div>
            </dl>
            <p className="mt-3 text-caption text-graphite-600">{t("contractor.profile.changeHint")}</p>
          </>
        )}
      </Card>
      <Card>
        <h2 className="text-h3 text-charcoal-900">{t("language.label")}</h2>
        <p className="mt-1 text-caption text-graphite-600">{t("profile.languageHint")}</p>
        <LanguageSwitcher className="mt-3" />
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
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
