import * as svc from "./contractors.service.js";
import { listContractors } from "../work/assignments.service.js";
import { publicUser } from "../auth/auth.service.js";
import { setSessionCookie } from "../../auth/cookies.js";

export const makeContractorsController = (prisma) => ({
  async list(req, res) {
    res.json({ contractors: await listContractors(prisma, req.validated.query) });
  },

  async similar(req, res) {
    res.json({ similar: await svc.findSimilar(prisma, req.validated.body) });
  },

  async create(req, res) {
    const { contractor, inviteUrl, inviteExpiresAt } = await svc.createContractor(prisma, req.user, req.validated.body);
    // inviteUrl is shown once; only its hash is stored.
    res.status(201).json({ contractor: svc.publicContractor(contractor), inviteUrl, inviteExpiresAt });
  },

  async reissueInvite(req, res) {
    res.json(await svc.reissueInvite(prisma, req.user, req.validated.params.id));
  },

  async deactivate(req, res) {
    const c = await svc.deactivateContractor(prisma, req.user, req.validated.params.id, req.validated.body.reason);
    res.json({ contractor: svc.publicContractor(c) });
  },

  async getInvite(req, res) {
    res.json({ invite: await svc.getInvite(prisma, req.validated.params.token) });
  },

  async acceptInvite(req, res) {
    const { user, session } = await svc.acceptInvite(prisma, req.validated.params.token, req.validated.body.password);
    setSessionCookie(res, session);
    res.json({ user: publicUser(user) });
  },
});
