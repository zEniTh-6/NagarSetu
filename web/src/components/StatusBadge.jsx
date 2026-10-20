import { useTranslation } from "react-i18next";
import { CircleDot, CircleCheck, Hammer, CircleCheckBig, CircleX, Link2, Undo2, Forward } from "lucide-react";
import { Pill } from "./Pill.jsx";

// Issue statuses from the server (IssueStatus enum). Filled, tinted badges.
export const STATUS_STYLES = {
  REPORTED: { icon: CircleDot, className: "bg-status-reported-tint text-status-reported" },
  ACKNOWLEDGED: { icon: CircleCheck, className: "bg-status-acknowledged-tint text-status-acknowledged" },
  IN_PROGRESS: { icon: Hammer, className: "bg-status-in-progress-tint text-status-in-progress" },
  RESOLVED: { icon: CircleCheckBig, className: "bg-status-resolved-tint text-status-resolved" },
  REJECTED: { icon: CircleX, className: "bg-status-rejected-tint text-status-rejected" },
  DUPLICATE: { icon: Link2, className: "bg-status-duplicate-tint text-status-duplicate" },
  WITHDRAWN: { icon: Undo2, className: "bg-status-withdrawn-tint text-status-withdrawn" },
};

/**
 * @param {{ status: keyof STATUS_STYLES, rejectionType?: string }} props
 * A rejection of type NOT_OUR_JURISDICTION is shown to citizens as "Forwarded" (D-003).
 */
export function StatusBadge({ status, rejectionType, className }) {
  const { t } = useTranslation();
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.REPORTED;
  const forwarded = status === "REJECTED" && rejectionType === "NOT_OUR_JURISDICTION";
  return (
    <Pill icon={forwarded ? Forward : style.icon} className={[style.className, className].filter(Boolean).join(" ")}>
      {forwarded ? t("status.FORWARDED") : t(`status.${status}`)}
    </Pill>
  );
}
