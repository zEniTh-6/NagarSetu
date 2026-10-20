// Decisions on a new report (status REPORTED): accept, reject, forward ("not our jurisdiction"),
// reroute, link as duplicate. Every one is confirmed; the citizen is always told why.
import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Ban, Check, Forward, Link2, Shuffle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/Button.jsx";
import { Input } from "../../../components/Input.jsx";
import { Select } from "../../../components/Select.jsx";
import { useToast } from "../../../components/Toast.jsx";
import { ConfirmAction } from "../../../components/admin/ConfirmAction.jsx";
import { useCategoryName } from "../../../components/citizen/CategoryIcon.jsx";
import { adminApi } from "../../../api/admin.js";
import { categoriesApi, qk } from "../../../api/citizen.js";
import { PriorityChoice } from "./WorkActions.jsx";
import { useAfterAction } from "./useAdminIssue.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function DecisionActions({ issue }) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const categoryName = useCategoryName();
  const after = useAfterAction(issue.id);
  const [open, setOpen] = useState(null);
  const [priority, setPriority] = useState(issue.ai?.riskLevel ?? "");
  const [rejectType, setRejectType] = useState("NOT_VALID");
  const [category, setCategory] = useState("");
  const [target, setTarget] = useState("");
  const categories = useQuery({ queryKey: qk.categories, queryFn: () => categoriesApi.list().then((r) => r.categories), staleTime: Infinity });

  const close = () => setOpen(null);
  const done = (key) => (res) => {
    toast.show({ tone: "success", title: t(`admin.review.done.${key}`) });
    return after(res);
  };
  const differs = issue.ai?.riskLevel && priority && priority !== issue.ai.riskLevel;

  return (
    <div className="space-y-2">
      <Button fullWidth leftIcon={Check} onClick={() => setOpen("accept")}>
        {t("admin.review.accept")}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" leftIcon={Shuffle} onClick={() => setOpen("reroute")}>
          {t("admin.review.reroute")}
        </Button>
        <Button variant="outline" leftIcon={Link2} onClick={() => setOpen("link")}>
          {t("admin.review.link")}
        </Button>
        <Button variant="outline" leftIcon={Forward} onClick={() => setOpen("forward")}>
          {t("admin.review.forward")}
        </Button>
        <Button variant="destructive-outline" leftIcon={Ban} onClick={() => setOpen("reject")}>
          {t("admin.review.reject")}
        </Button>
      </div>

      <ConfirmAction
        open={open === "accept"}
        onClose={close}
        title={t("admin.review.acceptTitle")}
        description={t("admin.review.acceptBody")}
        confirmLabel={t("admin.review.accept")}
        reason={differs ? "required" : false}
        reasonLabel={t("admin.review.priorityReason")}
        reasonHint={differs ? t("admin.review.priorityDiffers", { ai: t(`priority.${issue.ai.riskLevel}`) }) : undefined}
        onConfirm={(reason) => adminApi.accept(issue.id, priority ? { priority, ...(reason ? { priorityReason: reason } : {}) } : {}).then(done("accept"))}
      >
        <PriorityChoice value={priority} onChange={setPriority} ai={issue.ai?.riskLevel} optional />
      </ConfirmAction>

      <ConfirmAction
        open={open === "reject"}
        onClose={close}
        tone="destructive"
        title={t("admin.review.rejectTitle")}
        description={t("admin.review.rejectBody")}
        confirmLabel={t("admin.review.reject")}
        reason="required"
        reasonLabel={t("admin.review.reasonForCitizen")}
        onConfirm={(reason) => adminApi.reject(issue.id, { type: rejectType, reason }).then(done("reject"))}
      >
        <Select
          label={t("admin.review.rejectType")}
          value={rejectType}
          onChange={(e) => setRejectType(e.target.value)}
          options={["NOT_VALID", "OTHER"].map((v) => ({ value: v, label: t(`admin.review.rejectTypes.${v}`) }))}
        />
      </ConfirmAction>

      <ConfirmAction
        open={open === "forward"}
        onClose={close}
        title={t("admin.review.forwardTitle")}
        description={t("admin.review.forwardBody")}
        confirmLabel={t("admin.review.forward")}
        reason="required"
        reasonLabel={t("admin.review.forwardReason")}
        onConfirm={(reason) => adminApi.forward(issue.id, { reason }).then(done("forward"))}
      />

      <ConfirmAction
        open={open === "reroute"}
        onClose={close}
        title={t("admin.review.rerouteTitle")}
        description={t("admin.review.rerouteBody")}
        confirmLabel={t("admin.review.reroute")}
        reason="required"
        reasonLabel={t("admin.review.reasonForCitizen")}
        canConfirm={Boolean(category)}
        onConfirm={async (reason) => {
          const res = await adminApi.reroute(issue.id, { categoryKey: category, reason });
          toast.show({ tone: "success", title: t("admin.review.done.reroute") });
          after(res.issue ? res : null);
          // Moved to another department: this admin can't see it any more.
          if (!res.stillInYourDepartment) navigate("/admin/issues", { replace: true });
        }}
      >
        <Select
          label={t("admin.review.newCategory")}
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={[
            { value: "", label: t("admin.review.chooseCategory"), disabled: true },
            ...(categories.data ?? []).filter((c) => c.key !== issue.category.key).map((c) => ({ value: c.key, label: `${categoryName(c)} — ${c.department?.name ?? ""}` })),
          ]}
        />
      </ConfirmAction>

      <ConfirmAction
        open={open === "link"}
        onClose={close}
        title={t("admin.review.linkTitle")}
        description={t("admin.review.linkBody")}
        confirmLabel={t("admin.review.link")}
        reason="optional"
        reasonLabel={t("admin.review.reasonForCitizen")}
        canConfirm={UUID.test(target.trim())}
        onConfirm={(reason) => adminApi.linkDuplicate(issue.id, { targetIssueId: target.trim(), ...(reason ? { reason } : {}) }).then(done("link"))}
      >
        <Input label={t("admin.review.linkTarget")} hint={t("admin.review.linkTargetHint")} value={target} onChange={(e) => setTarget(e.target.value)} />
      </ConfirmAction>
    </div>
  );
}
