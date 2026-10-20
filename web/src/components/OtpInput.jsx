import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { cx } from "../lib/cx.js";

/**
 * Six separate digit boxes that behave like one field: typing moves forward, Backspace moves back,
 * pasting "123456" (or "123 456") fills every box. `value` is the digits typed so far.
 */
export function OtpInput({ value = "", onChange, length = 6, error, disabled, autoFocus, labelledBy, onComplete }) {
  const { t } = useTranslation();
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const focus = (i) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  const emit = (next, focusAt = next.length) => {
    onChange(next);
    focus(Math.min(focusAt, length - 1));
    if (next.length === length) onComplete?.(next);
  };

  /** Several digits (paste, SMS-style autofill): fill from `index` onwards. */
  const fillFrom = (index, incoming) => {
    const clean = incoming.replace(/\D/g, "");
    if (clean) emit((value.slice(0, index) + clean).slice(0, length));
  };

  const onBoxChange = (i, raw) => {
    if (raw === "") {
      // Some mobile keyboards delete without a Backspace keydown.
      onChange(value.slice(0, i) + value.slice(i + 1));
      return;
    }
    const current = digits[i];
    // The box held a digit and the new one was typed before or after it: keep only the new one.
    const typed = current && raw.length === 2 ? (raw[0] === current ? raw[1] : raw[0]) : raw;
    const clean = typed.replace(/\D/g, "");
    if (!clean) return;
    if (clean.length > 1) return fillFrom(i, clean);
    if (i < value.length) emit(value.slice(0, i) + clean + value.slice(i + 1), i + 1);
    else emit((value + clean).slice(0, length));
  };

  const onKeyDown = (i, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) onChange(value.slice(0, i) + value.slice(i + 1));
      else if (i > 0) {
        onChange(value.slice(0, i - 1) + value.slice(i));
        focus(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focus(i + 1);
    }
  };

  return (
    <div role="group" aria-labelledby={labelledBy} className="flex justify-center gap-2 sm:gap-3">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={d}
          // Only the next empty box (or the last) is reachable by Tab, so the group acts like one field.
          tabIndex={i === Math.min(value.length, length - 1) ? 0 : -1}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          pattern="[0-9]*"
          maxLength={length}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={t("otp.digitLabel", { n: i + 1, total: length })}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onBoxChange(i, e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            fillFrom(0, e.clipboardData.getData("text"));
          }}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          className={cx(
            "tnum h-14 w-11 rounded-control border-[1.5px] bg-white text-center text-h2 font-semibold text-charcoal-900 sm:w-12",
            "focus:outline-2 focus:outline-offset-0 focus:outline-teal-700",
            error ? "border-error" : d ? "border-charcoal-900 bg-ivory-50" : "border-field-border",
          )}
        />
      ))}
    </div>
  );
}
