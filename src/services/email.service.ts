import nodemailer from 'nodemailer';
import { env } from '../config/env.config.js';

const configured = Boolean(env.smtpUser && env.smtpPassword && env.smtpFrom);
const transporter = configured ? nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: env.smtpSecure,
  auth: { user: env.smtpUser, pass: env.smtpPassword }
}) : null;

async function send(to: string, subject: string, text: string): Promise<void> {
  if (!transporter) throw new Error('SMTP email is not configured');
  await transporter.sendMail({ from: env.smtpFrom, to, subject, text });
}

export const emailService = {
  sendInvitation(to: string, token: string): Promise<void> {
    const link = `${env.frontendUrl}/set-password?token=${encodeURIComponent(token)}`;
    return send(to, 'Set up your Sunvika account', `Use this secure, single-use link to set your password: ${link}\nThis link expires in 24 hours.`);
  },
  sendPasswordReset(to: string, token: string): Promise<void> {
    const link = `${env.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    return send(to, 'Reset your Sunvika password', `Use this secure, single-use link to reset your password: ${link}\nThis link expires in 1 hour.`);
  }
};
