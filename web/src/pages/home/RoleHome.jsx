// Placeholder home for each role until their screens are built (later phases). No mock data.
import { Construction, MailWarning } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppShell } from "../../components/AppShell.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { useMe } from "../../auth/session.js";

export default function RoleHome() {
  const { t } = useTranslation();
  const { user } = useMe();
  if (!user) return null;
  const needsVerify = user.role === "CITIZEN" && !user.emailVerified;

  return (
    <AppShell>
      <p className="text-eyebrow uppercase text-brass-700">{t(`role.${user.role}`)}</p>
      <h1 className="mt-1 text-h1 text-charcoal-900">{t("home.welcome", { name: user.name })}</h1>
      {needsVerify && (
        <Alert
          tone="warning"
          className="mt-6"
          title={t("home.verifyTitle")}
          action={
            <Button size="sm" to="/verify-email" leftIcon={MailWarning}>
              {t("home.verifyAction")}
            </Button>
          }
        >
          {t("home.verifyBody")}
        </Alert>
      )}
      <Card className="mt-6">
        <EmptyState icon={Construction} title={t("home.comingTitle")} message={t(`home.coming.${user.role}`)} />
      </Card>
    </AppShell>
  );
}
