import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "./Input.jsx";

export const PasswordInput = forwardRef(function PasswordInput(props, ref) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <Input
      ref={ref}
      type={visible ? "text" : "password"}
      spellCheck={false}
      autoCapitalize="none"
      {...props}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="tap inline-flex items-center justify-center rounded-control text-graphite-600 hover:text-charcoal-900"
          aria-label={visible ? t("common.hidePassword") : t("common.showPassword")}
          aria-pressed={visible}
        >
          <Icon aria-hidden="true" className="size-5" />
        </button>
      }
    />
  );
});
