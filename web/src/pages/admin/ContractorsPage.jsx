// Contractors (design/mockups/admin/contractors-list, invite-contractor, deactivate-contractor-modal).
// Any admin can invite or deactivate (D-005). Invite: similar-contractor warning first, then a
// one-time link shown once with its expiry. Deactivate: reason + the active jobs to reassign
// (nothing happens to the jobs automatically). Not copied from the mockups: SMS/WhatsApp invites.
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, HardHat, Link2, Search, UserMinus, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../components/Alert.jsx";
import { Button } from "../../components/Button.jsx";
import { Card } from "../../components/Card.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { Input } from "../../components/Input.jsx";
import { Modal } from "../../components/Modal.jsx";
import { Pill } from "../../components/Pill.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { useToast } from "../../components/Toast.jsx";
import { DeadlineCell, PageHeader, Ref, When } from "../../components/admin/AdminBits.jsx";
import { ConfirmAction } from "../../components/admin/ConfirmAction.jsx";
import { adminApi, ak } from "../../api/admin.js";
import { ApiError } from "../../api/client.js";
import { errorText } from "../../lib/errors.js";

const EMPTY = { name: "", phone: "", email: "", workType: "", licenceNumber: "" };

/** The one-time invite link, shown once (only its hash is stored). */
function InviteLink({ url, expiresAt, onDone }) {
  const { t } = useTranslation();
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.show({ tone: "success", title: t("admin.contractors.copied") });
    } catch {
      toast.show({ tone: "error", title: t("admin.contractors.copyFailed") });
    }
  };
  return (
    <div className="space-y-3">
      <Alert tone="success" title={t("admin.contractors.linkTitle")}>
        {t("admin.contractors.linkBody")}
      </Alert>
      <Input label={t("admin.contractors.link")} readOnly value={url} onFocus={(e) => e.target.select()} />
      <p className="text-caption text-charcoal-900">
        {t("admin.contractors.expires")} <When at={expiresAt} />
      </p>
      <div className="flex gap-2">
        <Button leftIcon={Copy} onClick={copy}>
          {t("admin.contractors.copy")}
        </Button>
        <Button variant="outline" onClick={onDone}>
          {t("admin.contractors.done")}
        </Button>
      </div>
    </div>
  );
}

function InviteDialog({ open, onClose }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [similar, setSimilar] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setSimilar(null);
  };
  const close = () => {
    setForm(EMPTY);
    setSimilar(null);
    setResult(null);
    setError(null);
    onClose();
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim()));
    try {
      const res = await adminApi.createContractor(similar ? { ...body, confirmSimilar: true } : body);
      setResult(res);
      qc.invalidateQueries({ queryKey: ak.all });
    } catch (err) {
      if (err instanceof ApiError && err.code === "SIMILAR_CONTRACTORS") setSimilar(err.details?.similar ?? []);
      else setError(errorText(t, i18n, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={t("admin.contractors.inviteTitle")} description={result ? undefined : t("admin.contractors.inviteBody")}>
      {result ? (
        <InviteLink url={result.inviteUrl} expiresAt={result.inviteExpiresAt} onDone={close} />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert tone="error" title={error} />}
          <Input label={t("admin.contractors.name")} required value={form.name} onChange={set("name")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={t("admin.contractors.phone")} required type="tel" value={form.phone} onChange={set("phone")} />
            <Input label={t("admin.contractors.email")} required type="email" value={form.email} onChange={set("email")} />
            <Input label={t("admin.contractors.workType")} optional hint={t("admin.contractors.workTypeHint")} value={form.workType} onChange={set("workType")} />
            <Input label={t("admin.contractors.licence")} optional value={form.licenceNumber} onChange={set("licenceNumber")} />
          </div>
          {similar && (
            <Alert tone="warning" title={t("admin.contractors.similarTitle")}>
              <ul className="mt-1 space-y-1">
                {similar.map((c) => (
                  <li key={c.id}>
                    <span className="font-semibold">{c.name}</span> · {c.phone} {c.licenceNumber ? `· ${c.licenceNumber}` : ""} ·{" "}
                    {t("admin.contractors.matchedOn", { fields: c.matchedOn.map((m) => t(`admin.contractors.match.${m}`)).join(", ") })}
                  </li>
                ))}
              </ul>
              <p className="mt-2">{t("admin.contractors.similarBody")}</p>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" leftIcon={UserPlus} loading={busy} disabled={!form.name.trim() || !form.phone.trim() || !form.email.trim()}>
              {similar ? t("admin.contractors.createAnyway") : t("admin.contractors.create")}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function DeactivateDialog({ contractor, onClose }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const jobs = useQuery({ queryKey: ak.jobs(contractor.id), queryFn: () => adminApi.contractorJobs(contractor.id) });
  return (
    <ConfirmAction
      open
      onClose={onClose}
      tone="destructive"
      title={t("admin.contractors.deactivateTitle", { name: contractor.name })}
      description={t("admin.contractors.deactivateBody")}
      confirmLabel={t("admin.contractors.deactivate")}
      reason="required"
      reasonLabel={t("admin.contractors.reasonLogged")}
      onConfirm={async (reason) => {
        await adminApi.deactivateContractor(contractor.id, reason);
        toast.show({ tone: "success", title: t("admin.contractors.deactivated") });
        qc.invalidateQueries({ queryKey: ak.all });
      }}
    >
      {jobs.isPending ? (
        <Spinner />
      ) : jobs.error ? (
        <Alert tone="error" title={errorText(t, i18n, jobs.error)} />
      ) : (
        <JobsList data={jobs.data} />
      )}
    </ConfirmAction>
  );
}

function JobsList({ data }) {
  const { t } = useTranslation();
  if (!data.jobs.length && !data.otherDepartmentsJobs) return <p className="text-body text-charcoal-900">{t("admin.contractors.noJobs")}</p>;
  return (
    <div>
      <p className="text-label text-charcoal-900">{t("admin.contractors.jobsToReassign", { count: data.jobs.length })}</p>
      <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto">
        {data.jobs.map((j) => (
          <li key={j.assignmentId} className="flex items-center justify-between gap-3 rounded-control border border-stone-300 p-2 text-caption">
            <Link to={`/admin/issues/${j.issue.id}`} className="text-teal-700 underline">
              <Ref id={j.issue.id} />
            </Link>
            <span className="line-clamp-1 flex-1 text-charcoal-900">{j.issue.description}</span>
            <DeadlineCell assignment={j} />
          </li>
        ))}
      </ul>
      {data.otherDepartmentsJobs > 0 && <p className="mt-2 text-caption text-charcoal-900">{t("admin.contractors.otherJobs", { count: data.otherDepartmentsJobs })}</p>}
      <p className="mt-2 text-caption text-charcoal-900">{t("admin.contractors.reassignNote")}</p>
    </div>
  );
}

export default function ContractorsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const includeInactive = params.get("includeInactive") === "true";
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [inviting, setInviting] = useState(false);
  const [deactivating, setDeactivating] = useState(null);
  const [reissueFor, setReissueFor] = useState(null); // contractor waiting for a new link
  const [newLink, setNewLink] = useState(null); // { url, expiresAt }, shown once
  const filters = { search: query || undefined, includeInactive };
  const list = useQuery({ queryKey: ak.contractors(filters), queryFn: () => adminApi.contractors(filters).then((r) => r.contractors) });

  return (
    <>
      <PageHeader
        title={t("admin.contractors.title")}
        subtitle={t("admin.contractors.subtitle")}
        actions={
          <Button leftIcon={UserPlus} onClick={() => setInviting(true)}>
            {t("admin.contractors.invite")}
          </Button>
        }
      />
      <Card padding="p-4" className="mb-4">
        <form
          role="search"
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
          }}
        >
          <Input className="min-w-64 flex-1" label={t("admin.contractors.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button type="submit" variant="outline" leftIcon={Search}>
            {t("admin.issues.searchButton")}
          </Button>
          <label className="flex min-h-12 items-center gap-2 text-label text-charcoal-900">
            <input
              type="checkbox"
              className="size-5 accent-teal-700"
              checked={includeInactive}
              onChange={(e) => setParams(e.target.checked ? { includeInactive: "true" } : {}, { replace: true })}
            />
            {t("admin.contractors.showInactive")}
          </label>
        </form>
      </Card>

      {list.isPending ? (
        <Spinner />
      ) : list.error ? (
        <Alert tone="error" title={errorText(t, i18n, list.error)} />
      ) : list.data.length === 0 ? (
        <Card>
          <EmptyState icon={HardHat} title={t("admin.contractors.empty")} />
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-card border border-stone-300 bg-white">
          <table className="w-full min-w-[56rem] text-caption">
            <caption className="sr-only">{t("admin.contractors.title")}</caption>
            <thead className="bg-ivory-50 text-eyebrow uppercase text-graphite-600">
              <tr>
                {["name", "contact", "workType", "licence", "jobs", "status", "actions"].map((c) => (
                  <th key={c} scope="col" className="px-3 py-3 text-start font-semibold">
                    {t(`admin.contractors.col.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-300">
              {list.data.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="px-3 py-3 font-semibold text-charcoal-900">{c.name}</td>
                  <td className="px-3 py-3 text-charcoal-900">
                    {c.phone}
                    <br />
                    <span className="text-graphite-600">{c.email}</span>
                  </td>
                  <td className="px-3 py-3 text-charcoal-900">{c.workType || "—"}</td>
                  <td className="px-3 py-3 text-charcoal-900">{c.licenceNumber || "—"}</td>
                  <td className="tnum px-3 py-3 text-charcoal-900">{c.activeJobs}</td>
                  <td className="px-3 py-3">
                    <Pill className={c.status === "ACTIVE" ? "bg-status-resolved-tint text-status-resolved" : "bg-error-tint text-error"}>{t(`admin.contractors.status.${c.status}`)}</Pill>
                    {c.invitePending && c.status === "ACTIVE" && <p className="mt-1 text-warning">{t("admin.contractors.invitePending")}</p>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      {c.invitePending && c.status === "ACTIVE" && (
                        <Button size="sm" variant="outline" leftIcon={Link2} onClick={() => setReissueFor(c)}>
                          {t("admin.contractors.newLink")}
                        </Button>
                      )}
                      {c.status === "ACTIVE" && (
                        <Button size="sm" variant="destructive-outline" leftIcon={UserMinus} onClick={() => setDeactivating(c)}>
                          {t("admin.contractors.deactivate")}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
      {deactivating && <DeactivateDialog contractor={deactivating} onClose={() => setDeactivating(null)} />}
      <ConfirmAction
        open={Boolean(reissueFor)}
        onClose={() => setReissueFor(null)}
        title={t("admin.contractors.newLinkTitle", { name: reissueFor?.name ?? "" })}
        description={t("admin.contractors.newLinkBody")}
        confirmLabel={t("admin.contractors.newLink")}
        onConfirm={async () => {
          const res = await adminApi.reissueInvite(reissueFor.id);
          qc.invalidateQueries({ queryKey: ak.all });
          toast.show({ tone: "success", title: t("admin.contractors.newLinkMade") });
          setNewLink({ url: res.inviteUrl, expiresAt: res.inviteExpiresAt });
        }}
      />
      <Modal open={Boolean(newLink)} onClose={() => setNewLink(null)} title={t("admin.contractors.inviteTitle")}>
        {newLink && <InviteLink url={newLink.url} expiresAt={newLink.expiresAt} onDone={() => setNewLink(null)} />}
      </Modal>
    </>
  );
}
