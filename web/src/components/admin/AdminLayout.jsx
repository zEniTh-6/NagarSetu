// Desktop admin frame (design/stitch/admin): left sidebar (Dashboard, Issues, Disputes, Contractors,
// Comments, Audit log) and a top bar with the department name, alerts, language switch and account.
// Below lg the sidebar opens from a menu button.
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ClipboardList, Gavel, HardHat, History, LayoutDashboard, LogOut, Menu, MessageSquareWarning, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Logo } from "../Logo.jsx";
import { LanguageSwitcher } from "../LanguageSwitcher.jsx";
import { useLogout, useMe } from "../../auth/session.js";
import { adminApi, ak } from "../../api/admin.js";
import { notificationsApi, qk } from "../../api/citizen.js";
import { useNotifications } from "../citizen/useNotifications.js";
import { useNotificationText } from "../../pages/citizen/NotificationsPage.jsx";
import { formatRelative } from "../../lib/format.js";
import { cx } from "../../lib/cx.js";

const NAV = [
  { to: "/admin", end: true, icon: LayoutDashboard, key: "dashboard" },
  { to: "/admin/issues", icon: ClipboardList, key: "issues", count: (d) => d.waitingForReview },
  { to: "/admin/disputes", icon: Gavel, key: "disputes", count: (d) => d.disputed },
  { to: "/admin/contractors", icon: HardHat, key: "contractors", count: (d) => d.needsReassignment },
  { to: "/admin/comments", icon: MessageSquareWarning, key: "comments" },
  { to: "/admin/audit", icon: History, key: "audit" },
];

export function useDashboard() {
  return useQuery({ queryKey: ak.dashboard, queryFn: adminApi.dashboard, refetchInterval: 60_000 });
}

function Sidebar({ onNavigate }) {
  const { t } = useTranslation();
  const { data } = useDashboard();
  return (
    <nav aria-label={t("admin.nav.label")} className="flex flex-col gap-1 p-3">
      {NAV.map((item) => {
        const n = data && item.count ? item.count(data) : 0;
        return (
          <NavLink
            key={item.key}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                "flex min-h-11 items-center gap-3 rounded-control px-3 text-label",
                isActive ? "bg-teal-700 font-bold text-white" : "text-charcoal-900 hover:bg-sage-100",
              )
            }
          >
            <item.icon aria-hidden="true" className="size-5 shrink-0" />
            <span className="flex-1">{t(`admin.nav.${item.key}`)}</span>
            {n > 0 && (
              <span className="tnum min-w-6 rounded-full bg-brass-400 px-1.5 text-center text-caption font-bold text-forest-900">
                {n}
                <span className="sr-only"> {t("admin.nav.pending")}</span>
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

function AlertsMenu() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { data } = useNotifications();
  const text = useNotificationText();
  const unread = data?.unread ?? 0;

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const openOne = (n) => {
    if (!n.readAt) notificationsApi.read(n.id).then(() => qc.invalidateQueries({ queryKey: qk.notifications })).catch(() => {});
    setOpen(false);
    if (n.issueId) navigate(`/admin/issues/${n.issueId}`);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="tap relative inline-flex size-11 items-center justify-center rounded-control text-charcoal-900 hover:bg-sage-100"
        aria-label={t("admin.alerts.button", { count: unread })}
      >
        <Bell aria-hidden="true" className="size-5" />
        {unread > 0 && (
          <span aria-hidden="true" className="tnum absolute end-1 top-1 min-w-5 rounded-full bg-error px-1 text-center text-[11px] leading-5 font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute end-0 z-40 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-card border border-stone-300 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-stone-300 px-4 py-3">
            <p className="text-label text-charcoal-900">{t("notifications.title")}</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => notificationsApi.readAll().then(() => qc.invalidateQueries({ queryKey: qk.notifications }))}
                className="text-caption font-semibold text-teal-700 hover:underline"
              >
                {t("notifications.readAll")}
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {(data?.items ?? []).length === 0 && <li className="px-4 py-6 text-center text-caption text-graphite-600">{t("notifications.empty")}</li>}
            {(data?.items ?? []).map((n) => {
              const { title, body } = text(n);
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => openOne(n)} className={cx("block w-full px-4 py-3 text-start hover:bg-ivory-50", !n.readAt && "bg-sage-100/50")}>
                    <span className="block text-label text-charcoal-900">{title}</span>
                    {body && <span className="mt-0.5 line-clamp-2 block text-caption text-charcoal-900">{body}</span>}
                    <span className="mt-0.5 block text-caption text-graphite-600">{formatRelative(n.createdAt, i18n.resolvedLanguage)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AdminLayout() {
  const { t } = useTranslation();
  const { user } = useMe();
  const { data } = useDashboard();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [location.pathname]);

  const onLogout = async () => {
    await logout().catch(() => {});
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-dvh bg-ivory-50 lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className={cx("border-e border-stone-300 bg-white lg:sticky lg:top-0 lg:block lg:h-dvh", menu ? "fixed inset-y-0 start-0 z-50 w-72 shadow-xl" : "hidden")}>
        <div className="flex items-center justify-between border-b border-stone-300 px-4 py-3">
          <Link to="/admin" aria-label={t("admin.nav.dashboard")} className="rounded-control">
            <Logo caption={false} />
          </Link>
          {menu && (
            <button type="button" onClick={() => setMenu(false)} aria-label={t("common.close")} className="tap inline-flex size-11 items-center justify-center lg:hidden">
              <X aria-hidden="true" className="size-5" />
            </button>
          )}
        </div>
        <Sidebar onNavigate={() => setMenu(false)} />
      </aside>
      {menu && <div aria-hidden="true" className="fixed inset-0 z-40 bg-forest-900/60 lg:hidden" onClick={() => setMenu(false)} />}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-300 bg-white/95 px-4 py-2 backdrop-blur md:px-8">
          <button type="button" onClick={() => setMenu(true)} aria-label={t("admin.nav.open")} className="tap inline-flex size-11 items-center justify-center rounded-control lg:hidden">
            <Menu aria-hidden="true" className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-eyebrow uppercase text-graphite-600">{t("admin.title")}</p>
            <p className="truncate text-label text-charcoal-900">{data?.department?.name ?? " "}</p>
          </div>
          <LanguageSwitcher className="hidden md:inline-flex" />
          <AlertsMenu />
          <div className="hidden text-end md:block">
            <p className="text-label text-charcoal-900">{user?.name}</p>
            <p className="text-caption text-graphite-600">{t("role.ADMIN")}</p>
          </div>
          <button type="button" onClick={onLogout} className="tap inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-label text-charcoal-900 hover:bg-sage-100">
            <LogOut aria-hidden="true" className="size-5" />
            <span className="hidden sm:inline">{t("common.logout")}</span>
          </button>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
