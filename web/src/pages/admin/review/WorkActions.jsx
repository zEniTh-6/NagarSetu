// Work on an accepted issue: final priority, assign / reassign a contractor with a deadline, change
// the deadline, and (resolved) reopen or keep resolved. Deadlines are set only by the admin.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Flag, RotateCcw, ShieldCheck, UserPlus, UserRoundCog } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/Button.jsx";
import { Input } from "../../../components/Input.jsx";
import { Select } from "../../../components/Select.jsx";
import { Textarea } from "../../../components/Textarea.jsx";
import { useToast } from "../../../components/Toast.jsx";
import { ConfirmAction } from "../../../components/admin/ConfirmAction.jsx";
import { adminApi, ak } from "../../../api/admin.js";
import { formatDate } from "../../../lib/format.js";
import { useAfterAction } from "./useAdminIssue.js";

export const LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** yyyy-mm-dd (local) for a date input. */
export const toDateInput = (d) => {
  if (!d) return "";
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
/** A picked day → the end of that day (local time), as ISO. */
export const endOfDay = (v) => (v ? new Date(`${v}T23:59:00`).toISOString() : null);

/** Final priority picker; the AI's suggestion is shown next to it, never pre-decided. */
export function PriorityChoice({ value, onChange, ai, optional = false }) {
  const { t } = useTranslation();
  return (
    <Select
      label={t("admin.review.finalPriority")}
      hint={ai ? t("admin.review.aiSuggests", { level: t(`priority.${ai}`) }) : t("admin.review.noAiSuggestion")}
      required={!optional}
      optional={optional}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={[{ value: "", label: optional ? t("admin.review.decideLater") : t("admin.review.choosePriority"), disabled: !optional }, ...LEVELS.map((l) => ({ value: l, label: t(`priority.${l}`) }))]}
    />
  );
}

function ContractorPicker({ value, onChange, exclude }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ak.contractors({ active: true }), queryFn: () => adminApi.contractors().then((r) => r.contractors) });
  const options = (q.data ?? [])
    .filter((c) => c.id !== exclude)
    .map((c) => ({
      value: c.id,
      disabled: c.invitePending,
      label: `${c.name}${c.workType ? ` · ${c.workType}` : ""} · ${t("admin.review.activeJobs", { count: c.activeJobs })}${c.invitePending ? ` · ${t("admin.contractors.invitePending")}` : ""}`,
    }));
  return (
    <Select
      label={t("admin.review.contractor")}
      hint={t("admin.review.contractorHint")}
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={[{ value: "", label: t("admin.review.chooseContractor"), disabled: true }, ...options]}
    />
  );
}

export function WorkActions({ issue }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const after = useAfterAction(issue.id);
  const [open, setOpen] = useState(null);
  const [priority, setPriority] = useState(issue.priority ?? issue.ai?.riskLevel ?? "");
  const [contractor, setContractor] = useState("");
  const [note, setNote] = useState(""); // instructions for the contractor (optional, shown as written)
  const [deadline, setDeadline] = useState(toDateInput(issue.assignment?.deadline?.deadlineAt ?? issue.suggestedDeadline));
  const close = () => setOpen(null);
  const done = (key) => (res) => {
    toast.show({ tone: "success", title: t(`admin.review.done.${key}`) });
    return after(res);
  };

  const open_ = ["ACKNOWLEDGED", "IN_PROGRESS"].includes(issue.status);
  const current = issue.assignment;
  const disputed = issue.flags?.some((f) => f.type === "DISPUTED");
  const prioDiffers = issue.ai?.riskLevel && priority && priority !== issue.ai.riskLevel;
  const minDate = toDateInput(new Date(Date.now() + 86_400_000));
  const suggested = issue.suggestedDeadline ? t("admin.review.suggestedDeadline", { date: formatDate(issue.suggestedDeadline, i18n.resolvedLanguage) }) : undefined;

  return (
    <div className="space-y-2">
      {open_ && (
        <>
          <Button fullWidth variant="outline" leftIcon={Flag} onClick={() => setOpen("priority")}>
            {issue.priority ? t("admin.review.changePriority") : t("admin.review.setPriority")}
          </Button>
          {issue.status === "ACKNOWLEDGED" && !current ? (
            <Button fullWidth leftIcon={UserPlus} disabled={!issue.priority} onClick={() => setOpen("assign")}>
              {t("admin.review.assign")}
            </Button>
          ) : (
            current && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" leftIcon={UserRoundCog} onClick={() => setOpen("reassign")}>
                  {t("admin.review.reassign")}
                </Button>
                <Button variant="outline" leftIcon={CalendarClock} onClick={() => setOpen("deadline")}>
                  {t("admin.review.changeDeadline")}
                </Button>
              </div>
            )
          )}
          {!issue.priority && issue.status === "ACKNOWLEDGED" && <p className="text-caption text-graphite-600">{t("admin.review.priorityFirst")}</p>}
        </>
      )}
      {issue.status === "RESOLVED" && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="destructive-outline" leftIcon={RotateCcw} onClick={() => setOpen("reopen")}>
            {t("admin.review.reopen")}
          </Button>
          {disputed && (
            <Button variant="outline" leftIcon={ShieldCheck} onClick={() => setOpen("dismiss")}>
              {t("admin.review.keepResolved")}
            </Button>
          )}
        </div>
      )}

      <ConfirmAction
        open={open === "priority"}
        onClose={close}
        title={t("admin.review.priorityTitle")}
        description={t("admin.review.priorityBody")}
        confirmLabel={t("admin.review.savePriority")}
        reason={prioDiffers ? "required" : "optional"}
        reasonLabel={t("admin.review.priorityReason")}
        reasonHint={prioDiffers ? t("admin.review.priorityDiffers", { ai: t(`priority.${issue.ai.riskLevel}`) }) : undefined}
        canConfirm={Boolean(priority)}
        onConfirm={(reason) => adminApi.priority(issue.id, { priority, ...(reason ? { reason } : {}) }).then(done("priority"))}
      >
        <PriorityChoice value={priority} onChange={setPriority} ai={issue.ai?.riskLevel} />
      </ConfirmAction>

      <ConfirmAction
        open={open === "assign"}
        onClose={close}
        title={t("admin.review.assignTitle")}
        description={t("admin.review.assignBody")}
        confirmLabel={t("admin.review.assign")}
        canConfirm={Boolean(contractor && deadline)}
        onConfirm={() => adminApi.assign(issue.id, { contractorId: contractor, deadlineAt: endOfDay(deadline), ...(note.trim() ? { note } : {}) }).then(done("assign"))}
      >
        <ContractorPicker value={contractor} onChange={setContractor} />
        <Input className="mt-4" type="date" label={t("admin.review.deadline")} hint={suggested} required min={minDate} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        <Textarea className="mt-4" label={t("admin.review.contractorNote")} hint={t("admin.review.contractorNoteHint")} optional rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </ConfirmAction>

      <ConfirmAction
        open={open === "reassign"}
        onClose={close}
        title={t("admin.review.reassignTitle")}
        description={t("admin.review.reassignBody", { name: current?.contractor?.name ?? "" })}
        confirmLabel={t("admin.review.reassign")}
        reason="required"
        canConfirm={Boolean(contractor && deadline)}
        onConfirm={(reason) => adminApi.reassign(issue.id, { contractorId: contractor, deadlineAt: endOfDay(deadline), reason, ...(note.trim() ? { note } : {}) }).then(done("reassign"))}
      >
        <ContractorPicker value={contractor} onChange={setContractor} exclude={current?.contractor?.id} />
        <Input className="mt-4" type="date" label={t("admin.review.deadline")} required min={minDate} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        <Textarea className="mt-4" label={t("admin.review.contractorNote")} hint={t("admin.review.contractorNoteHint")} optional rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </ConfirmAction>

      <ConfirmAction
        open={open === "deadline"}
        onClose={close}
        title={t("admin.review.deadlineTitle")}
        description={t("admin.review.deadlineBody")}
        confirmLabel={t("admin.review.saveDeadline")}
        reason="required"
        canConfirm={Boolean(deadline)}
        onConfirm={(reason) => adminApi.deadline(issue.id, { deadlineAt: endOfDay(deadline), reason }).then(done("deadline"))}
      >
        <Input type="date" label={t("admin.review.deadline")} required min={minDate} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </ConfirmAction>

      <ConfirmAction
        open={open === "reopen"}
        onClose={close}
        tone="destructive"
        title={t("admin.review.reopenTitle")}
        description={t("admin.review.reopenBody")}
        confirmLabel={t("admin.review.reopen")}
        reason="required"
        reasonLabel={t("admin.review.reasonForCitizen")}
        onConfirm={(reason) => adminApi.reopen(issue.id, { reason }).then(done("reopen"))}
      />

      <ConfirmAction
        open={open === "dismiss"}
        onClose={close}
        title={t("admin.review.keepTitle")}
        description={t("admin.review.keepBody")}
        confirmLabel={t("admin.review.keepResolved")}
        reason="required"
        reasonLabel={t("admin.review.reasonForCitizen")}
        onConfirm={(reason) => adminApi.dismissDispute(issue.id, { reason }).then(done("dismiss"))}
      />
    </div>
  );
}
