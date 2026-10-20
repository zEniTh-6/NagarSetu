// Label + control + hint/error wiring shared by Input, PasswordInput and Select.
import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

export function FieldLabel({ htmlFor, required, optional, children, aside }) {
  const { t } = useTranslation();
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-label text-charcoal-900">
        {children}
        {required && (
          <span className="text-error" aria-hidden="true">
            {" "}
            *
          </span>
        )}
        {optional && <span className="ms-2 text-caption font-normal text-graphite-600">{t("common.optional")}</span>}
      </label>
      {aside}
    </div>
  );
}

export function FieldMessage({ id, error, hint }) {
  if (error) {
    return (
      <p id={id} className="mt-1.5 flex items-start gap-1.5 text-caption text-error">
        <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
        <span>{error}</span>
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="mt-1.5 text-caption text-graphite-600">
        {hint}
      </p>
    );
  }
  return null;
}

export const controlClasses = (error) =>
  [
    "block w-full min-h-12 rounded-control bg-white px-4 text-body text-charcoal-900 placeholder:text-graphite-600",
    "border-[1.5px] focus:outline-2 focus:outline-offset-0 focus:outline-teal-700 focus-visible:outline-offset-0",
    "disabled:cursor-not-allowed disabled:bg-ivory-50 disabled:text-graphite-600",
    error ? "border-error focus:outline-error" : "border-field-border",
  ].join(" ");
