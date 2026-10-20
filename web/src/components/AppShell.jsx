// Minimal signed-in frame: forest app bar with the wordmark, language switch and logout.
// Role screens arrive in later phases; this is what they will sit inside.
import { useNavigate } from "react-router";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Logo } from "./Logo.jsx";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";
import { useLogout, useMe } from "../auth/session.js";

/** compact: phone-only frame for MobileColumn (contractor); no screen-width breakpoints. Admin uses the default. */
export function AppShell({ children, compact = false }) {
  const { t } = useTranslation();
  const { user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout().catch(() => {});
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-dvh bg-ivory-50">
      <header className="on-dark border-b border-forest-900/10 bg-forest-900 text-ivory-50">
        <div className={compact ? "flex items-center justify-between gap-3 px-4 py-3" : "mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8"}>
          <Logo tone="dark" caption={false} />
          <div className="flex items-center gap-3">
            <div className={compact ? "hidden" : "hidden sm:block"}>
              <LanguageSwitcher tone="dark" />
            </div>
            {user && (
              <span className={compact ? "hidden" : "hidden text-caption text-sage-100 md:inline"}>
                {user.name} · {t(`role.${user.role}`)}
              </span>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="tap inline-flex items-center gap-2 rounded-control px-3 text-label text-ivory-50 hover:bg-ivory-50/10"
            >
              <LogOut aria-hidden="true" className="size-5" />
              <span>{t("common.logout")}</span>
            </button>
          </div>
        </div>
      </header>
      <div className={compact ? "flex justify-center px-4 pt-4" : "flex justify-center px-4 pt-4 sm:hidden"}>
        <LanguageSwitcher />
      </div>
      {/* @container: shared components size themselves by this area (container queries), not the window. */}
      <main className={compact ? "@container px-4 py-6" : "@container mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10"}>{children}</main>
    </div>
  );
}
