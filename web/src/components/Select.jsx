import { forwardRef, useId } from "react";
import { ChevronDown } from "lucide-react";
import { FieldLabel, FieldMessage, controlClasses } from "./Field.jsx";
import { cx } from "../lib/cx.js";

/** Native select (best on mobile). options: [{ value, label, disabled? }]. */
export const Select = forwardRef(function Select(
  { label, hint, error, required, optional, id, className, options = [], placeholder, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const msgId = `${selectId}-msg`;
  return (
    <div className={className}>
      {label && (
        <FieldLabel htmlFor={selectId} required={required} optional={optional}>
          {label}
        </FieldLabel>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          className={cx(controlClasses(error), "appearance-none pe-11")}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2 text-graphite-600" />
      </div>
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  );
});
