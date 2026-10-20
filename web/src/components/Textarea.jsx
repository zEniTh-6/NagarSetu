import { forwardRef, useId } from "react";
import { FieldLabel, FieldMessage, controlClasses } from "./Field.jsx";
import { cx } from "../lib/cx.js";

/** Multi-line text with a label and an optional character counter. */
export const Textarea = forwardRef(function Textarea(
  { label, hint, error, required, optional, id, className, maxLength, value = "", rows = 5, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const msgId = `${fieldId}-msg`;
  return (
    <div className={className}>
      {label && (
        <FieldLabel
          htmlFor={fieldId}
          required={required}
          optional={optional}
          aside={maxLength ? <span className="tnum text-caption text-graphite-600">{value.length} / {maxLength}</span> : null}
        >
          {label}
        </FieldLabel>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        value={value}
        maxLength={maxLength}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? msgId : undefined}
        className={cx(controlClasses(error), "py-3 leading-6")}
        {...rest}
      />
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  );
});
