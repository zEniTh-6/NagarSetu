import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cx } from "../lib/cx.js";

export function Spinner({ className, label }) {
  const { t } = useTranslation();
  return (
    <span role="status" className={cx("inline-flex items-center", className)}>
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
      <span className="sr-only">{label ?? t("common.loading")}</span>
    </span>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-teal-700">
      <Spinner className="[&_svg]:size-8" />
    </div>
  );
}
