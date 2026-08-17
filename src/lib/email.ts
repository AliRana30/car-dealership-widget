/**
 * Email service using Nodemailer.
 *
 * Required env vars:
 *   SMTP_HOST       - e.g. smtp.gmail.com
 *   SMTP_PORT       - e.g. 587 (TLS) or 465 (SSL)
 *   SMTP_SECURE     - "true" for port 465, "false" for 587
 *   SMTP_USER       - your Gmail address (or SMTP username)
 *   SMTP_PASS       - Gmail App Password (NOT your login password)
 *   SMTP_FROM_NAME  - Display name, e.g. "MyFrontDesk"
 *   SMTP_FROM_EMAIL - From address (optional, defaults to SMTP_USER)
 */

import nodemailer from 'nodemailer';

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

function getFrom(): string {
  const name = process.env.SMTP_FROM_NAME || 'MyFrontDesk';
  const email = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '';
  return `"${name}" <${email}>`;
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    if (process.env.NODE_ENV === 'development') {
      console.log('----------------------------------------------------');
      console.log(`[EMAIL DEV FALLBACK] Sending Email to: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`HTML: ${html}`);
      console.log('----------------------------------------------------');
      return;
    }
    throw new Error('[email] Missing SMTP config. Set SMTP_HOST, SMTP_USER, SMTP_PASS in env variables');
  }

  const transporter = getTransporter();
  await transporter.sendMail({ from: getFrom(), to, subject, html });
}

export async function sendVerificationOtp(email: string, code: string) {
  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F0F7FE;font-family:'Segoe UI',system-ui,sans-serif;">
  <div style="max-width:480px;margin:40px auto;padding:0 16px;">
    <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
      <div style="background:linear-gradient(135deg,#2F8FE0,#1D6FB8);padding:32px 32px 28px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.02em;">Verify your email</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">MyFrontDesk Account Setup</p>
      </div>
      <div style="padding:36px 32px;">
        <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.6;">
          Use the code below to complete your account registration. It expires in <strong>10 minutes</strong>.
        </p>
        <div style="background:#EFF6FF;border:2px dashed #BFDBFE;border-radius:16px;padding:28px;text-align:center;margin-bottom:28px;">
          <span style="font-size:44px;font-weight:800;letter-spacing:14px;color:#1D4ED8;font-family:monospace;">${code}</span>
        </div>
        <p style="margin:0;color:#9CA3AF;font-size:12px;line-height:1.5;">
          If you didn't create a MyFrontDesk account, you can safely ignore this email.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
  await sendEmail({ to: email, subject: `${code} — Your MyFrontDesk verification code`, html });
}

export async function sendPasswordResetEmail(email: string, resetLink: string) {
  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F0F7FE;font-family:'Segoe UI',system-ui,sans-serif;">
  <div style="max-width:480px;margin:40px auto;padding:0 16px;">
    <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
      <div style="background:linear-gradient(135deg,#2F8FE0,#1D6FB8);padding:32px 32px 28px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.02em;">Reset your password</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">MyFrontDesk</p>
      </div>
      <div style="padding:36px 32px;">
        <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.6;">
          Click the button below to reset your password. This link expires in <strong>1 hour</strong>.
        </p>
        <div style="text-align:center;margin-bottom:28px;">
          <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#2F8FE0,#1D6FB8);color:#fff;text-decoration:none;padding:15px 40px;border-radius:12px;font-weight:700;font-size:15px;">
            Reset Password
          </a>
        </div>
        <p style="margin:0 0 8px;color:#6B7280;font-size:12px;">Or copy this link:</p>
        <p style="margin:0;word-break:break-all;color:#2F8FE0;font-size:11px;">${resetLink}</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #F1F5F9;">
        <p style="margin:0;color:#9CA3AF;font-size:12px;line-height:1.5;">
          If you didn't request a password reset, ignore this email. The link will expire in 1 hour.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
  await sendEmail({ to: email, subject: 'Reset your MyFrontDesk password', html });
}
