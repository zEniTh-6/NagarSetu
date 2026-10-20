import { forwardRef, useId } from "react";
import { FieldLabel, FieldMessage, controlClasses } from "./Field.jsx";
import { cx } from "../lib/cx.js";

/** Text input with an always-visible label. `trailing` is an optional element inside the right edge. */
export const Input = forwardRef(function Input(
  { label, hint, error, required, optional, id, className, trailing, labelAside, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;
  return (
    <div className={className}>
      {label && (
        <FieldLabel htmlFor={inputId} required={required} optional={optional} aside={labelAside}>
          {label}
        </FieldLabel>
      )}
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          className={cx(controlClasses(error), trailing && "pe-12")}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 end-0 flex items-center pe-1">{trailing}</div>}
      </div>
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  );
});
