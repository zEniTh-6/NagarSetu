import { SearchX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../components/EmptyState.jsx";
import { Button } from "../components/Button.jsx";

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <EmptyState icon={SearchX} title={t("notFound.title")} message={t("notFound.body")} action={<Button to="/">{t("notFound.home")}</Button>} />
    </div>
  );
}
