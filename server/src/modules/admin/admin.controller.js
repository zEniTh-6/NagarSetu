import * as review from "./review.service.js";
import * as issues from "./adminIssues.service.js";
import { getIssue } from "../issues/issues.service.js";
import * as work from "../work/assignments.service.js";
import * as repairs from "../work/repairs.service.js";
import * as disputes from "../feedback/feedback.service.js";

export const makeAdminIssuesController = ({ prisma, jobs }) => {
  // After an action, answer with the fresh review view.
  const fresh = async (req) => ({ issue: await getIssue(prisma, { user: req.user, issueId: req.validated.params.id }) });
  const ids = (req) => ({ user: req.user, issueId: req.validated.params.id });

  return {
    async list(req, res) {
      res.json(await issues.listAdminIssues(prisma, { user: req.user, ...req.validated.query }));
    },
    async dashboard(req, res) {
      res.json(await issues.adminDashboard(prisma, { user: req.user }));
    },
    async accept(req, res) {
      const { priority, priorityReason } = req.validated.body;
      await review.acceptIssue(prisma, { ...ids(req), priority, priorityReason });
      res.json(await fresh(req));
    },
    async reject(req, res) {
      await review.rejectIssue(prisma, { ...ids(req), type: req.validated.body.type, reason: req.validated.body.reason });
      res.json(await fresh(req));
    },
    async forward(req, res) {
      await review.rejectIssue(prisma, { ...ids(req), type: "NOT_OUR_JURISDICTION", reason: req.validated.body.reason });
      res.json(await fresh(req));
    },
    async linkDuplicate(req, res) {
      await review.linkDuplicate(prisma, { ...ids(req), ...req.validated.body });
      res.json(await fresh(req));
    },
    async reroute(req, res) {
      const result = await review.rerouteIssue(prisma, { ...ids(req), ...req.validated.body, jobs });
      res.json(result.stillInYourDepartment ? { ...result, ...(await fresh(req)) } : result);
    },
    async priority(req, res) {
      await review.setPriority(prisma, { ...ids(req), ...req.validated.body });
      res.json(await fresh(req));
    },
    async clearFlag(req, res) {
      await review.clearFlag(prisma, { ...ids(req), flagId: req.validated.params.flagId, reason: req.validated.body.reason });
      res.json(await fresh(req));
    },
    async assign(req, res) {
      await work.assignContractor(prisma, { ...ids(req), ...req.validated.body });
      res.json(await fresh(req));
    },
    async reassign(req, res) {
      await work.reassignContractor(prisma, { ...ids(req), ...req.validated.body });
      res.json(await fresh(req));
    },
    async deadline(req, res) {
      await work.changeDeadline(prisma, { ...ids(req), ...req.validated.body });
      res.json(await fresh(req));
    },
    async reopen(req, res) {
      await disputes.reopenIssue(prisma, { ...ids(req), reason: req.validated.body.reason });
      res.json(await fresh(req));
    },
    async dismissDispute(req, res) {
      await disputes.dismissDispute(prisma, { ...ids(req), reason: req.validated.body.reason });
      res.json(await fresh(req));
    },
    async approveSubmission(req, res) {
      const { issueId } = await repairs.approveSubmission(prisma, { user: req.user, submissionId: req.validated.params.id, note: req.validated.body.note });
      res.json({ issue: await getIssue(prisma, { user: req.user, issueId }) });
    },
    async rejectSubmission(req, res) {
      const { issueId } = await repairs.rejectSubmission(prisma, { user: req.user, submissionId: req.validated.params.id, reason: req.validated.body.reason });
      res.json({ issue: await getIssue(prisma, { user: req.user, issueId }) });
    },
    async confirmFlag(req, res) {
      await review.confirmFlag(prisma, { ...ids(req), flagId: req.validated.params.flagId, reason: req.validated.body.reason });
      res.json(await fresh(req));
    },
  };
};
