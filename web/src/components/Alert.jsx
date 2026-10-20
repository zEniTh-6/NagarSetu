import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cx } from "../lib/cx.js";

const TONES = {
  error: { icon: CircleAlert, box: "border-error-border bg-error-tint", icon_: "text-error", title: "text-error" },
  success: { icon: CircleCheck, box: "border-success/30 bg-success-tint", icon_: "text-success", title: "text-success" },
  warning: { icon: TriangleAlert, box: "border-warning/30 bg-warning-tint", icon_: "text-warning", title: "text-warning" },
  info: { icon: Info, box: "border-info/30 bg-info-tint", icon_: "text-info", title: "text-info" },
};

/** Inline message box (form errors, notices). Errors are announced immediately. */
export function Alert({ tone = "info", title, children, action, className }) {
  const s = TONES[tone];
  const Icon = s.icon;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-3 rounded-control border p-4", s.box, className)}>
      <Icon aria-hidden="true" className={cx("mt-0.5 size-5 shrink-0", s.icon_)} />
      <div className="min-w-0 text-caption text-charcoal-900">
        {title && <p className={cx("text-label", s.title)}>{title}</p>}
        {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
