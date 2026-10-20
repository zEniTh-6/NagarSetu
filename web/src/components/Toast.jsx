// In-app toasts. useToast().show({ tone, title, message }). Announced politely to screen readers.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CircleCheck, CircleX, Info, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cx } from "../lib/cx.js";

const ToastContext = createContext(null);

const TONES = {
  success: { icon: CircleCheck, className: "text-success" },
  error: { icon: CircleX, className: "text-error" },
  info: { icon: Info, className: "text-info" },
};

export function ToastProvider({ children, duration = 5000 }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((x) => x.id !== id)), []);
  const show = useCallback(
    ({ tone = "info", title, message }) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, tone, title, message }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss, duration],
  );
  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastRegion({ toasts, onDismiss }) {
  const { t } = useTranslation();
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-4"
    >
      {toasts.map((toast) => {
        const tone = TONES[toast.tone] ?? TONES.info;
        const Icon = tone.icon;
        return (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-sm animate-fade-in items-start gap-3 rounded-control border border-stone-300 bg-white p-3 shadow-modal"
          >
            <Icon aria-hidden="true" className={cx("mt-0.5 size-5 shrink-0", tone.className)} />
            <div className="min-w-0 flex-1">
              {toast.title && <p className="text-label text-charcoal-900">{toast.title}</p>}
              {toast.message && <p className="text-caption text-graphite-600">{toast.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-graphite-600 hover:text-charcoal-900"
              aria-label={t("common.dismiss")}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
