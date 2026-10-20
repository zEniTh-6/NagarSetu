import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cx } from "../lib/cx.js";

/**
 * Vertical lifecycle timeline.
 * steps: [{ key, title, time?, detail?, state: "done" | "current" | "upcoming" }]
 */
export function Timeline({ steps, className, label }) {
  const { t } = useTranslation();
  return (
    <ol aria-label={label} className={cx("relative", className)}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0" aria-current={step.state === "current" ? "step" : undefined}>
            {!last && (
              <span
                aria-hidden="true"
                className={cx(
                  "absolute start-[15px] top-8 bottom-0 w-0.5",
                  step.state === "done" ? "bg-teal-700" : "bg-stone-300",
                )}
              />
            )}
            <span
              aria-hidden="true"
              className={cx(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2",
                step.state === "done" && "border-teal-700 bg-teal-700 text-white",
                step.state === "current" && "border-warning bg-warning-tint text-warning",
                step.state === "upcoming" && "border-stone-300 bg-white text-graphite-600",
              )}
            >
              {step.state === "done" ? (
                <Check className="size-4" strokeWidth={3} />
              ) : (
                <span className="tnum text-caption font-semibold">{i + 1}</span>
              )}
            </span>
            <div className="min-w-0 pt-1">
              <p className={cx("text-label", step.state === "upcoming" ? "text-graphite-600" : "text-charcoal-900")}>
                {step.title}
                <span className="sr-only"> — {t(`timeline.${step.state}`)}</span>
              </p>
              {step.time && <p className="tnum text-caption text-graphite-600">{step.time}</p>}
              {step.detail && <p className="text-caption text-graphite-600">{step.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
