import { useTranslation } from "react-i18next";
import { ArrowDown, Minus, ArrowUp, ChevronsUp } from "lucide-react";
import { Pill } from "./Pill.jsx";

// Priority (server Level enum). Set only by an admin; the AI risk is a separate suggestion.
export const PRIORITY_STYLES = {
  LOW: { icon: ArrowDown, className: "bg-sage-100 text-sage-600" },
  MEDIUM: { icon: Minus, className: "bg-info-tint text-info" },
  HIGH: { icon: ArrowUp, className: "bg-warning-tint text-warning" },
  CRITICAL: { icon: ChevronsUp, className: "bg-error-tint text-error font-bold" },
};

export function PriorityPill({ level, className }) {
  const { t } = useTranslation();
  const style = PRIORITY_STYLES[level] ?? PRIORITY_STYLES.MEDIUM;
  return (
    <Pill icon={style.icon} className={[style.className, className].filter(Boolean).join(" ")}>
      {t("priority.label", { level: t(`priority.${level}`) })}
    </Pill>
  );
}
