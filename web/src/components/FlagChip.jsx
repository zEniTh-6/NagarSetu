import { useTranslation } from "react-i18next";
import { ShieldAlert, Copy, Clock, TriangleAlert, MessageSquareWarning } from "lucide-react";
import { Pill } from "./Pill.jsx";

// Flags are separate from status and never block anything. Outlined, transparent, leading icon.
export const FLAG_STYLES = {
  SUSPICIOUS: { icon: ShieldAlert, className: "border border-warning text-warning" },
  POSSIBLE_DUPLICATE: { icon: Copy, className: "border border-info text-info" },
  PENDING_REVIEW: { icon: Clock, className: "border border-neutral text-neutral" },
  ESCALATED: { icon: TriangleAlert, className: "border border-error text-error" },
  DISPUTED: { icon: MessageSquareWarning, className: "border border-warning text-warning" },
};

export function FlagChip({ flag, className }) {
  const { t } = useTranslation();
  const style = FLAG_STYLES[flag] ?? FLAG_STYLES.PENDING_REVIEW;
  return (
    <Pill icon={style.icon} className={[style.className, "bg-transparent", className].filter(Boolean).join(" ")}>
      {t(`flag.${flag}`)}
    </Pill>
  );
}
