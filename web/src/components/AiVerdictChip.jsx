import { useTranslation } from "react-i18next";
import { CircleCheck, CircleX, CircleHelp, LoaderCircle } from "lucide-react";
import { Pill } from "./Pill.jsx";

// Always labelled "AI suggestion": the AI never decides anything by itself.
export const VERDICT_STYLES = {
  VALID: { icon: CircleCheck, className: "bg-success-tint text-success" },
  INVALID: { icon: CircleX, className: "bg-error-tint text-error" },
  UNCERTAIN: { icon: CircleHelp, className: "bg-warning-tint text-warning" },
  PENDING: { icon: LoaderCircle, className: "bg-neutral-tint text-neutral" },
};

/** verdict: VALID | INVALID | UNCERTAIN, or null/undefined while the check is still running. */
export function AiVerdictChip({ verdict, reason, className }) {
  const { t } = useTranslation();
  const key = verdict && VERDICT_STYLES[verdict] ? verdict : "PENDING";
  const style = VERDICT_STYLES[key];
  return (
    <Pill icon={style.icon} title={reason || undefined} className={[style.className, className].filter(Boolean).join(" ")}>
      {t("ai.suggestion", { verdict: t(`ai.${key}`) })}
    </Pill>
  );
}
