import { Inbox } from "lucide-react";

/** Nothing to show yet: icon tile, title, one line of help and an optional action. */
export function EmptyState({ icon: Icon = Inbox, title, message, action, className }) {
  return (
    <div className={["flex flex-col items-center px-6 py-10 text-center", className].filter(Boolean).join(" ")}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-card bg-sage-100 text-sage-600">
        <Icon aria-hidden="true" className="size-7" />
      </div>
      <h2 className="text-h3 text-charcoal-900">{title}</h2>
      {message && <p className="mt-1 max-w-sm text-caption text-graphite-600">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
