const nodemailer = require("nodemailer");
const config = require("../config/config");

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  if (!config.emailService?.user || !config.emailService?.pass) {
    return null;
  }
  transporter = nodemailer.createTransport({
    service: config.emailService.provider || "gmail",
    auth: {
      user: config.emailService.user,
      pass: config.emailService.pass,
    },
  });
  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  const transport = getTransporter();
  if (!transport) {
    console.warn("Email not configured; skipping send to", to);
    return { sent: false, reason: "email_not_configured" };
  }
  await transport.sendMail({
    from: config.emailService.user,
    to,
    subject,
    html,
    text,
  });
  return { sent: true };
};

const sendPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;
  return sendEmail({
    to: user.email,
    subject: "Provenance — Password reset",
    html: `<p>Hello ${user.full_name},</p><p><a href="${resetUrl}">Reset your password</a></p><p>Token expires in 1 hour.</p>`,
    text: `Reset your password: ${resetUrl}`,
  });
};

const sendInviteEmail = async (user, inviteToken, enterpriseName) => {
  const inviteUrl = `${config.frontendUrl}/accept-invite?token=${inviteToken}`;
  return sendEmail({
    to: user.email,
    subject: `Invitation to join ${enterpriseName} on Provenance`,
    html: `<p>You have been invited to ${enterpriseName}.</p><p><a href="${inviteUrl}">Accept invitation</a></p>`,
    text: `Accept invite: ${inviteUrl}`,
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendInviteEmail,
};
