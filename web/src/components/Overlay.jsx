// Shared behaviour for Modal and BottomSheet: portal, backdrop, focus trap, Escape, scroll lock,
// focus returned to the opener on close.
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cx } from "../lib/cx.js";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Overlay({ open, onClose, title, description, children, footer, placement, dismissible = true, className }) {
  const { t } = useTranslation();
  const panelRef = useRef(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const first = panel?.querySelector("[autofocus]") ?? panel?.querySelector(FOCUSABLE) ?? panel;
    first?.focus();

    const onKey = (e) => {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onCloseRef.current?.();
      } else if (e.key === "Tab" && panel) {
        const items = [...panel.querySelectorAll(FOCUSABLE)];
        if (!items.length) {
          e.preventDefault();
          return;
        }
        const firstItem = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open, dismissible]);

  if (!open) return null;

  const sheet = placement === "bottom";
  return createPortal(
    <div className={cx("fixed inset-0 z-50 flex", sheet ? "items-end justify-center" : "items-center justify-center p-4")}>
      <div
        className="absolute inset-0 animate-fade-in bg-backdrop"
        aria-hidden="true"
        onClick={dismissible ? () => onCloseRef.current?.() : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          "relative flex max-h-[90dvh] w-full flex-col bg-white text-charcoal-900",
          sheet
            ? "max-w-xl animate-sheet-up rounded-t-card shadow-sheet pb-[env(safe-area-inset-bottom)]"
            : "max-w-lg animate-fade-in rounded-card border border-stone-300 shadow-modal",
          className,
        )}
      >
        {sheet && <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-stone-300" />}
        <div className="flex items-start justify-between gap-4 border-b border-stone-300 px-5 pt-4 pb-3">
          <div>
            <h2 id={titleId} className="text-h2 text-charcoal-900">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-caption text-graphite-600">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={() => onCloseRef.current?.()}
              className="tap -me-2 -mt-1 inline-flex items-center justify-center rounded-control text-graphite-600 hover:bg-ivory-50 hover:text-charcoal-900"
              aria-label={t("common.close")}
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          )}
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-stone-300 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
