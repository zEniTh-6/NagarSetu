import * as svc from "./issues.service.js";
import * as dup from "./duplicates.service.js";

export const makeIssuesController = ({ prisma, storage, jobs, embed }) => ({
  async duplicateCheck(req, res) {
    res.json(await dup.checkForDuplicates(prisma, { input: req.validated.body, embed }));
  },

  async support(req, res) {
    const source = req.validated.body.fromDuplicatePopup ? "DUPLICATE_ACCEPTED" : "SUPPORT_BUTTON";
    res.json(await dup.supportIssue(prisma, { user: req.user, issueId: req.validated.params.id, source }));
  },

  async create(req, res) {
    const { created, issue } = await svc.createIssue(prisma, {
      user: req.user,
      input: req.validated.body,
      file: req.file,
      storage,
      jobs,
    });
    res.status(created ? 201 : 200).json({ issue, duplicateRequest: !created });
  },

  async retakePhoto(req, res) {
    const issue = await svc.retakePhoto(prisma, {
      user: req.user,
      issueId: req.validated.params.id,
      file: req.file,
      capturedAt: req.validated.body.capturedAt,
      storage,
      jobs,
    });
    res.json({ issue });
  },

  async withdraw(req, res) {
    const issue = await svc.withdrawIssue(prisma, { user: req.user, issueId: req.validated.params.id, reason: req.validated.body.reason });
    res.json({ issue });
  },

  async mine(req, res) {
    res.json(await svc.listMyIssues(prisma, { user: req.user, ...req.validated.query }));
  },

  async getOne(req, res) {
    res.json({ issue: await svc.getIssue(prisma, { user: req.user, issueId: req.validated.params.id }) });
  },

  async photo(req, res) {
    const { buffer, contentType } = await svc.getPhotoFile(prisma, {
      user: req.user,
      photoId: req.validated.params.id,
      variant: req.validated.query.variant,
      storage,
    });
    res.set({ "Content-Type": contentType, "Cache-Control": "private, max-age=3600", "Content-Disposition": "inline" });
    res.send(buffer);
  },

  async categories(_req, res) {
    res.json({ categories: await svc.listCategories(prisma) });
  },
});
