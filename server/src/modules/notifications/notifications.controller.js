import * as svc from "./notifications.service.js";

export const makeNotificationsController = (prisma) => ({
  async list(req, res) {
    res.json(await svc.listNotifications(prisma, { user: req.user, ...req.validated.query }));
  },
  async readAll(req, res) {
    res.json(await svc.markAllRead(prisma, { user: req.user }));
  },
  async read(req, res) {
    res.json({ notification: await svc.markRead(prisma, { user: req.user, id: req.validated.params.id }) });
  },
});
