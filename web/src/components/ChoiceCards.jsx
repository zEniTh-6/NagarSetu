// A radio group of cards (report category; later: filters, reasons).
// Selected: 2px Deep Teal border, Sage Tint ground, check icon, bold label.
// Unselected: white with a Stone Grey border. Never colour alone: the check icon and weight change too.
// Keyboard (WAI-ARIA radio group): Tab reaches the group once; arrows move and select; Enter/Space select.
import { useId, useRef } from "react";
import { CircleCheck } from "lucide-react";
import { cx } from "../lib/cx.js";

/**
 * options: [{ value, label, description?, icon?: ReactNode }]
 * The 1px → 2px border change is balanced with padding so nothing shifts.
 */
export function ChoiceCards({ label, required, options, value, onChange, error, className, columns = 1, gridClassName }) {
  const labelId = useId();
  const errorId = useId();
  const refs = useRef([]);
  const index = options.findIndex((o) => o.value === value);
  const tabStop = index >= 0 ? index : 0;

  const select = (i) => {
    const o = options[i];
    if (!o) return;
    onChange(o.value);
    refs.current[i]?.focus();
  };

  const onKeyDown = (e, i) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (step) {
      e.preventDefault();
      select((i + step + options.length) % options.length);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      select(i);
    }
  };

  return (
    <div className={className}>
      {label && (
        <p id={labelId} className="mb-2 text-label text-charcoal-900">
          {label}
          {required && (
            <span className="text-error" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </p>
      )}
      <div
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cx("grid gap-3", columns === 2 && "grid-cols-2", columns === 3 && "grid-cols-3", gridClassName)}
      >
        {options.map((o, i) => {
          const checked = o.value === value;
          return (
            <div
              key={o.value}
              ref={(el) => (refs.current[i] = el)}
              role="radio"
              aria-checked={checked}
              tabIndex={i === tabStop ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cx(
                "flex min-h-16 cursor-pointer select-none items-center gap-3 rounded-control text-charcoal-900 transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700",
                checked ? "border-2 border-teal-700 bg-sage-100 p-3" : "border border-stone-300 bg-white p-[13px] hover:border-field-border",
              )}
            >
              {o.icon}
              <span className="min-w-0 flex-1">
                <span className={cx("block text-body", checked ? "font-bold" : "font-medium")}>{o.label}</span>
                {o.description && <span className="block text-caption text-graphite-600">{o.description}</span>}
              </span>
              <CircleCheck
                aria-hidden="true"
                className={cx("size-6 shrink-0", checked ? "text-teal-700" : "invisible")}
                strokeWidth={2.25}
              />
            </div>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-caption text-error">
          {error}
        </p>
      )}
    </div>
  );
}
