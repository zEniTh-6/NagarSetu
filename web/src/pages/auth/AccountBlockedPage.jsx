import { useState } from "react";
import { useSearchParams } from "react-router";
import { Hourglass, ShieldX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "../../components/AuthLayout.jsx";
import { Button } from "../../components/Button.jsx";
import { formatMmSs, useCountdown } from "../../lib/useCountdown.js";

// Two cases from the server: ACCOUNT_DEACTIVATED (403) and ACCOUNT_LOCKED (423, retryAfterMinutes).
export default function AccountBlockedPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const locked = params.get("reason") === "locked";
  const minutes = Math.min(60, Math.max(1, Number.parseInt(params.get("minutes") ?? "15", 10) || 15));
  const [until] = useState(() => Date.now() + minutes * 60 * 1000);
  const left = useCountdown(locked ? until : null);

  if (locked) {
    return (
      <AuthLayout backTo="/login" backLabel={t("common.backToLogin")} icon={Hourglass} title={t("blocked.lockedTitle")} subtitle={t("blocked.lockedBody")}>
        <div className="mb-5 flex items-center justify-between gap-3 rounded-control border border-stone-300 bg-ivory-50 p-4">
          <div>
            <p className="text-eyebrow uppercase text-graphite-600">{t("blocked.cooldown")}</p>
            <p className="tnum text-h2 text-charcoal-900">
              {left > 0 ? t("blocked.remaining", { time: formatMmSs(left) }) : t("blocked.tryNow")}
            </p>
          </div>
          <span className="rounded-full border border-warning px-2.5 py-0.5 text-caption font-semibold text-warning">{t("blocked.lockedChip")}</span>
        </div>
        <div className="space-y-3">
          <Button fullWidth to="/forgot-password">
            {t("blocked.resetInstead")}
          </Button>
          <Button variant="outline" fullWidth to="/login">
            {t("common.backToLogin")}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={ShieldX} title={t("blocked.deactivatedTitle")} subtitle={t("blocked.deactivatedBody")}>
      <Button variant="outline" fullWidth to="/login">
        {t("common.backToLogin")}
      </Button>
    </AuthLayout>
  );
}
