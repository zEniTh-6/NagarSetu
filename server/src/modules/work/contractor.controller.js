import * as svc from "./contractorWork.service.js";

export const makeContractorController = ({ prisma, storage, jobs }) => ({
  async list(req, res) {
    res.json(await svc.listMyJobs(prisma, { user: req.user, ...req.validated.query }));
  },
  async me(req, res) {
    res.json({ contractor: await svc.myProfile(prisma, { user: req.user }) });
  },
  async getOne(req, res) {
    res.json({ job: await svc.getMyJob(prisma, { user: req.user, issueId: req.validated.params.id }) });
  },
  async start(req, res) {
    res.json({ job: await svc.startWork(prisma, { user: req.user, issueId: req.validated.params.id }) });
  },
  async submit(req, res) {
    const { created, job } = await svc.submitRepair(prisma, {
      user: req.user,
      issueId: req.validated.params.id,
      input: req.validated.body,
      file: req.file,
      storage,
      jobs,
    });
    res.status(created ? 201 : 200).json({ job, duplicateRequest: !created });
  },
});
