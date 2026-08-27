/**
 * EmailService
 * Transactional email service for RiskLoop support events using Nodemailer & SMTP.
 * Dispatches branded responsive HTML emails for:
 * 1. Support agent replied
 * 2. Ticket status changed
 * 3. Ticket resolved
 *
 * Includes graceful dev/fallback logging when SMTP credentials are not configured,
 * and fail-safe error isolation so email failures never disrupt core support operations.
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

class EmailService {
  constructor(customTransporter = null) {
    this.customTransporter = customTransporter;
    this.lastSentEmail = null; // Stored for test assertions
  }

  /**
   * Get SMTP configuration from environment
   */
  getConfig() {
    return {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.EMAIL_FROM || 'RiskLoop Support <support@riskloop.io>',
      appUrl: process.env.APP_URL || process.env.API_BASE_URL || 'http://localhost:3000'
    };
  }

  /**
   * Check if live SMTP credentials are fully configured
   */
  isSmtpConfigured() {
    const config = this.getConfig();
    const hasHost = Boolean(config.host && config.host.trim().length > 0 && !config.host.includes('<'));
    const hasUser = Boolean(config.user && config.user.trim().length > 0 && !config.user.includes('<'));
    const hasPass = Boolean(config.pass && config.pass.trim().length > 0 && !config.pass.includes('<') && !config.pass.includes('placeholder'));
    return Boolean(hasHost && hasUser && hasPass);
  }

  /**
   * Create or retrieve Nodemailer transporter
   */
  getTransporter() {
    if (this.customTransporter) {
      return this.customTransporter;
    }

    const config = this.getConfig();

    if (!this.isSmtpConfigured()) {
      return null;
    }

    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      }
    });
  }

  /**
   * Format human-readable status labels & colors
   */
  getStatusMeta(status) {
    switch (status) {
      case 'under_review':
        return { label: 'Under Review', bg: '#f59e0b', color: '#1a1506' };
      case 'waiting_for_user':
        return { label: 'Waiting for You', bg: '#8b5cf6', color: '#ffffff' };
      case 'resolved':
        return { label: 'Resolved', bg: '#10b981', color: '#ffffff' };
      case 'open':
      default:
        return { label: 'Open', bg: '#3b82f6', color: '#ffffff' };
    }
  }

  /**
   * Generate branded RiskLoop base email layout
   */
  buildBaseTemplate({ title, badgeText, badgeBg, badgeColor, contentHtml, ticketNumber, ticketId, appUrl }) {
    const ticketUrl = `${appUrl}/#my-tickets`;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0d111d;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #f0f3fa;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #0d111d;
      padding: 40px 0 40px 0;
    }
    .main-card {
      max-width: 580px;
      margin: 0 auto;
      background-color: #141829;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
    }
    .header {
      padding: 28px 32px 20px 32px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      background: linear-gradient(180deg, rgba(224, 169, 78, 0.08) 0%, rgba(20, 24, 41, 0) 100%);
    }
    .brand-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .brand-name {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #f0f3fa;
      margin: 0;
    }
    .brand-name span {
      color: #e0a94e;
    }
    .ticket-badge {
      display: inline-block;
      font-family: monospace;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      background-color: rgba(224, 169, 78, 0.15);
      color: #e0a94e;
      border: 1px solid rgba(224, 169, 78, 0.3);
    }
    .email-title {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      margin: 8px 0 4px 0;
      line-height: 1.3;
    }
    .content {
      padding: 28px 32px;
      font-size: 14.5px;
      line-height: 1.6;
      color: #cbd5e1;
    }
    .message-box {
      background-color: rgba(255, 255, 255, 0.03);
      border-left: 3px solid #e0a94e;
      border-radius: 4px 8px 8px 4px;
      padding: 16px 20px;
      margin: 20px 0;
      color: #e2e8f0;
      font-size: 14px;
      line-height: 1.6;
      white-space: pre-wrap;
    }
    .status-pill {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .btn-container {
      margin: 28px 0 16px 0;
      text-align: center;
    }
    .btn {
      display: inline-block;
      padding: 12px 28px;
      background: linear-gradient(135deg, #e0a94e 0%, #c89238 100%);
      color: #141829 !important;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
      border-radius: 8px;
      box-shadow: 0 4px 14px rgba(224, 169, 78, 0.3);
    }
    .footer {
      padding: 24px 32px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      background-color: #0f1322;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      line-height: 1.6;
    }
    .footer a {
      color: #94a3b8;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="main-card">
      <div class="header">
        <table style="width: 100%;">
          <tr>
            <td style="text-align: left;">
              <h1 class="brand-name">RISK<span>LOOP</span></h1>
            </td>
            <td style="text-align: right;">
              <span class="ticket-badge">#${ticketNumber}</span>
            </td>
          </tr>
        </table>
        <h2 class="email-title">${title}</h2>
        ${badgeText ? `<div style="margin-top: 8px;"><span class="status-pill" style="background-color: ${badgeBg}; color: ${badgeColor};">${badgeText}</span></div>` : ''}
      </div>
      <div class="content">
        ${contentHtml}
        <div class="btn-container">
          <a href="${ticketUrl}" class="btn" target="_blank">View Ticket #${ticketNumber}</a>
        </div>
      </div>
      <div class="footer">
        <p style="margin: 0 0 6px 0;">You received this transactional email regarding support ticket #${ticketNumber}.</p>
        <p style="margin: 0;">RiskLoop Institutional Trading & Risk Management Platform &bull; <a href="${appUrl}">riskloop.io</a></p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Low-level send email method
   */
  async sendEmail({ to, subject, html, text }) {
    if (!to) {
      return { success: false, error: 'Recipient email address is required' };
    }

    const config = this.getConfig();
    const mailOptions = {
      from: config.from,
      to: to,
      subject: subject,
      html: html,
      text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    };

    const transporter = this.getTransporter();

    // Development fallback if SMTP is not configured
    if (!transporter) {
      console.log(`ℹ️ [EmailService: Dev Mode] Email to <${to}>: "${subject}"`);
      this.lastSentEmail = {
        mode: 'development_fallback',
        ...mailOptions,
        sentAt: new Date().toISOString()
      };
      return {
        success: true,
        mode: 'development_fallback',
        messageId: `dev-msg-${Date.now()}`
      };
    }

    try {
      const info = await transporter.sendMail(mailOptions);
      this.lastSentEmail = {
        mode: 'smtp',
        ...mailOptions,
        messageId: info.messageId,
        sentAt: new Date().toISOString()
      };
      return {
        success: true,
        mode: 'smtp',
        messageId: info.messageId
      };
    } catch (err) {
      console.error(`❌ [EmailService] Failed to send email to ${to}:`, err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * 1. Send Support Agent Reply Email
   */
  async sendSupportReplyEmail({ to, ticketNumber, ticketId, messageText, category }) {
    try {
      const config = this.getConfig();
      const subject = `[RiskLoop Support #${ticketNumber}] New reply from Support Desk`;

      const contentHtml = `
        <p style="margin-top: 0;">Hello,</p>
        <p>A support specialist from RiskLoop has replied to your support ticket regarding <strong>${category ? category.toUpperCase() : 'General Support'}</strong>.</p>
        <div class="message-box">${this.escapeHtml(messageText)}</div>
        <p>To view the full conversation or respond, please click the button below to open your ticket in the RiskLoop portal.</p>
      `;

      const text = `
[RiskLoop Support #${ticketNumber}] New reply from Support Desk

Hello,

A support specialist from RiskLoop has replied to your support ticket regarding ${category ? category.toUpperCase() : 'General Support'}:

---
${messageText}
---

To view the conversation or reply, please visit:
${config.appUrl}/#my-tickets
      `.trim();

      const html = this.buildBaseTemplate({
        title: 'New Support Reply',
        badgeText: 'Support Reply',
        badgeBg: 'rgba(59, 130, 246, 0.2)',
        badgeColor: '#60a5fa',
        contentHtml: contentHtml,
        ticketNumber: ticketNumber,
        ticketId: ticketId,
        appUrl: config.appUrl
      });

      return await this.sendEmail({ to, subject, html, text });
    } catch (err) {
      console.error('[EmailService] sendSupportReplyEmail error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * 2. Send Ticket Status Change Email
   */
  async sendTicketStatusChangeEmail({ to, ticketNumber, ticketId, previousStatus, newStatus, category }) {
    try {
      const config = this.getConfig();
      const newStatusMeta = this.getStatusMeta(newStatus);
      const prevStatusMeta = this.getStatusMeta(previousStatus);

      const subject = `[RiskLoop Support #${ticketNumber}] Status updated to ${newStatusMeta.label}`;

      const contentHtml = `
        <p style="margin-top: 0;">Hello,</p>
        <p>Your support ticket <strong>#${ticketNumber}</strong> has been updated by the RiskLoop support team.</p>
        
        <table style="width: 100%; margin: 20px 0; background: rgba(255,255,255,0.03); border-radius: 8px; padding: 16px; border: 1px solid rgba(255,255,255,0.06);">
          <tr>
            <td style="color: #94a3b8; font-size: 13px;">Previous Status:</td>
            <td style="text-align: right; font-weight: 600; color: #cbd5e1;">${prevStatusMeta.label}</td>
          </tr>
          <tr>
            <td style="color: #94a3b8; font-size: 13px; padding-top: 8px;">New Status:</td>
            <td style="text-align: right; font-weight: 700; color: ${newStatusMeta.bg}; padding-top: 8px;">${newStatusMeta.label}</td>
          </tr>
          <tr>
            <td style="color: #94a3b8; font-size: 13px; padding-top: 8px;">Category:</td>
            <td style="text-align: right; font-weight: 600; color: #cbd5e1; padding-top: 8px;">${(category || 'General').toUpperCase()}</td>
          </tr>
        </table>

        ${newStatus === 'waiting_for_user' 
          ? '<p style="color: #fbbf24; font-weight: 600;">⚠️ The support team is waiting for additional information from you to proceed.</p>' 
          : '<p>Our engineering and institutional operations team is actively working on your request.</p>'}
      `;

      const text = `
[RiskLoop Support #${ticketNumber}] Status updated to ${newStatusMeta.label}

Hello,

Your support ticket #${ticketNumber} has been updated:
- Previous Status: ${prevStatusMeta.label}
- New Status: ${newStatusMeta.label}
- Category: ${(category || 'General').toUpperCase()}

View details:
${config.appUrl}/#my-tickets
      `.trim();

      const html = this.buildBaseTemplate({
        title: 'Ticket Status Updated',
        badgeText: newStatusMeta.label,
        badgeBg: newStatusMeta.bg,
        badgeColor: newStatusMeta.color,
        contentHtml: contentHtml,
        ticketNumber: ticketNumber,
        ticketId: ticketId,
        appUrl: config.appUrl
      });

      return await this.sendEmail({ to, subject, html, text });
    } catch (err) {
      console.error('[EmailService] sendTicketStatusChangeEmail error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * 3. Send Ticket Resolved Email
   */
  async sendTicketResolvedEmail({ to, ticketNumber, ticketId, category, resolutionNote }) {
    try {
      const config = this.getConfig();
      const subject = `[RiskLoop Support #${ticketNumber}] Your ticket has been resolved`;

      const contentHtml = `
        <p style="margin-top: 0;">Hello,</p>
        <p>Your support ticket <strong>#${ticketNumber}</strong> has been marked as <strong style="color: #10b981;">RESOLVED</strong> by the RiskLoop team.</p>
        
        ${resolutionNote ? `
          <div class="message-box" style="border-left-color: #10b981;">
            <strong>Resolution Notes:</strong><br/>
            ${this.escapeHtml(resolutionNote)}
          </div>
        ` : ''}

        <p>If your issue is fully addressed, no further action is required. If you still require assistance or if you have further questions, you can reopen this inquiry at any time by replying directly in the portal.</p>
      `;

      const text = `
[RiskLoop Support #${ticketNumber}] Your ticket has been resolved

Hello,

Your support ticket #${ticketNumber} has been marked as RESOLVED.
${resolutionNote ? `\nResolution Notes:\n${resolutionNote}\n` : ''}
If you still need assistance, you can view your ticket at:
${config.appUrl}/#my-tickets
      `.trim();

      const html = this.buildBaseTemplate({
        title: 'Ticket Resolved',
        badgeText: 'Resolved',
        badgeBg: '#10b981',
        badgeColor: '#ffffff',
        contentHtml: contentHtml,
        ticketNumber: ticketNumber,
        ticketId: ticketId,
        appUrl: config.appUrl
      });

      return await this.sendEmail({ to, subject, html, text });
    } catch (err) {
      console.error('[EmailService] sendTicketResolvedEmail error:', err.message);
      return { success: false, error: err.message };
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export const emailService = new EmailService();
export { EmailService };
export default emailService;
