// Frame for login and account screens (from design/mockups/shared/login*.png).
// Mobile: compact header (or the hero panel on login), white form card, language switch, notice.
// Desktop (lg+): Midnight Forest panel on the left, form on the right.
import { Link } from "react-router";
import { ArrowLeft, Camera, ListChecks, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Logo } from "./Logo.jsx";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";
import { PrototypeNotice } from "./PrototypeNotice.jsx";

export function AuthLayout({ title, subtitle, icon: Icon, backTo, backLabel, heroOnMobile = false, children, footer }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-ivory-50 lg:flex lg:items-center lg:justify-center lg:p-8">
      <div className="mx-auto w-full max-w-md px-4 pt-4 pb-8 sm:pt-8 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:overflow-hidden lg:rounded-card lg:border lg:border-stone-300 lg:bg-white lg:p-0">
        {/* Desktop brand panel */}
        <aside className="on-dark hidden bg-forest-900 p-12 text-ivory-50 lg:flex lg:flex-col">
          <Logo tone="dark" />
          <h1 className="mt-12 text-display text-ivory-50">{t("auth.hero.title")}</h1>
          <p className="mt-4 max-w-sm text-body text-sage-100">{t("auth.hero.body")}</p>
          <ul className="mt-10 space-y-3">
            {[
              [Camera, t("auth.hero.point1")],
              [ListChecks, t("auth.hero.point2")],
              [ShieldCheck, t("auth.hero.point3")],
            ].map(([PointIcon, text]) => (
              <li key={text} className="flex items-center gap-3 rounded-control border border-ivory-50/15 px-4 py-3 text-label font-medium">
                <PointIcon aria-hidden="true" className="size-5 shrink-0 text-brass-400" />
                {text}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-12">
            <LanguageSwitcher tone="dark" />
          </div>
        </aside>

        <main className="lg:flex lg:flex-col lg:p-12">
          {/* Mobile header */}
          <header className="mb-4 flex items-center justify-between gap-3 lg:hidden">
            {backTo ? (
              <Link to={backTo} className="tap -ms-2 inline-flex items-center gap-2 rounded-control px-2 text-label text-forest-900">
                <ArrowLeft aria-hidden="true" className="size-5" />
                {backLabel ?? t("common.back")}
              </Link>
            ) : (
              !heroOnMobile && <Logo caption={false} />
            )}
          </header>

          {heroOnMobile && (
            <section className="on-dark mb-4 rounded-card bg-forest-900 p-5 text-ivory-50 lg:hidden">
              <Logo tone="dark" />
              <p className="mt-5 text-h1 text-ivory-50">{t("auth.hero.title")}</p>
              <p className="mt-2 text-caption text-sage-100">{t("auth.hero.body")}</p>
            </section>
          )}

          <div className="rounded-card border border-stone-300 bg-white p-5 sm:p-6 lg:mx-auto lg:w-full lg:max-w-md lg:border-0 lg:p-0">
            {backTo && (
              <Link to={backTo} className="tap -ms-2 mb-4 hidden items-center gap-2 rounded-control px-2 text-label text-forest-900 lg:inline-flex">
                <ArrowLeft aria-hidden="true" className="size-5" />
                {backLabel ?? t("common.back")}
              </Link>
            )}
            {Icon && (
              <div className="mb-4 flex size-12 items-center justify-center rounded-control bg-sage-100 text-teal-700">
                <Icon aria-hidden="true" className="size-6" />
              </div>
            )}
            {title && <h1 className="text-h1 text-charcoal-900 lg:text-display">{title}</h1>}
            {subtitle && <p className="mt-1.5 text-body text-graphite-600">{subtitle}</p>}
            <div className={title ? "mt-6" : undefined}>{children}</div>
            {footer && <div className="mt-6 border-t border-stone-300 pt-5">{footer}</div>}
          </div>

          <div className="mt-6 flex flex-col items-center gap-4 lg:mx-auto lg:mt-auto lg:w-full lg:max-w-md lg:pt-10">
            <LanguageSwitcher className="lg:hidden" />
            <PrototypeNotice />
          </div>
        </main>
      </div>
    </div>
  );
}
