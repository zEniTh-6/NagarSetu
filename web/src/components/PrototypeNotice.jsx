import { useTranslation } from "react-i18next";

/** Required on login screens: this is a college prototype, not an official platform. */
export function PrototypeNotice({ className }) {
  const { t } = useTranslation();
  return <p className={["text-center text-caption text-graphite-600", className].filter(Boolean).join(" ")}>{t("brand.prototypeNotice")}</p>;
}
