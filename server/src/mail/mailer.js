// One function to send email. Transport comes from MAIL_TRANSPORT:
//   log    – print to the server console (development; the OTP shows up there)
//   smtp   – send through SMTP_HOST (nodemailer)
//   memory – keep in `outbox` (tests)
// Email is used ONLY for the signup OTP and password reset links (see docs/brief.md).
import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export const outbox = [];

let smtp;
function smtpTransport() {
  smtp ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return smtp;
}

/** @param {{to: string, subject: string, text: string}} message */
export async function sendMail({ to, subject, text }) {
  const message = { from: env.MAIL_FROM, to, subject, text };
  switch (env.MAIL_TRANSPORT) {
    case "memory":
      outbox.push(message);
      return;
    case "log":
      console.log(`\n--- email (MAIL_TRANSPORT=log) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n--- end email ---\n`);
      return;
    case "smtp":
      await smtpTransport().sendMail(message);
      return;
  }
}
