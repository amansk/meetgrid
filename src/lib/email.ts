import type { Env } from '../types';

const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send';
const SEND_TIMEOUT_MS = 5000;

/** Deliberately loose: catches typos like a missing @, leaves the rest to SendGrid. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export type EmailStatus = 'sent' | 'not_configured' | 'failed';

export type EmailFetcher = (input: string, init: RequestInit) => Promise<Response>;

export function parseEmail(raw: string): string | null {
  const email = raw.trim();
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) return null;
  return email;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface AdminLinkEmail {
  to: string;
  title: string;
  pollUrl: string;
  organizerUrl: string;
}

export function buildAdminLinkEmail(msg: AdminLinkEmail): { subject: string; text: string; html: string } {
  const subject = `Your Meetgrid poll: ${msg.title}`;
  const text = [
    `Your poll "${msg.title}" is ready.`,
    '',
    'Share this link with participants:',
    msg.pollUrl,
    '',
    'Your admin link — pick the final time and close the poll from here. Keep it to yourself: anyone with it controls the poll.',
    msg.organizerUrl,
  ].join('\n');
  const title = escapeHtml(msg.title);
  const pollUrl = escapeHtml(msg.pollUrl);
  const organizerUrl = escapeHtml(msg.organizerUrl);
  const html = `<p>Your poll <strong>${title}</strong> is ready.</p>
<p>Share this link with participants:<br><a href="${pollUrl}">${pollUrl}</a></p>
<p>Your admin link — pick the final time and close the poll from here. Keep it to yourself: anyone with it controls the poll.<br><a href="${organizerUrl}">${organizerUrl}</a></p>`;
  return { subject, text, html };
}

/**
 * Email the organizer their admin link through SendGrid. Never throws: poll
 * creation has already succeeded by the time this runs, and a missing key or a
 * SendGrid outage must not turn that into an error for the caller.
 */
export async function sendAdminLinkEmail(
  env: Env,
  msg: AdminLinkEmail,
  fetcher: EmailFetcher = (input, init) => fetch(input, init)
): Promise<EmailStatus> {
  const apiKey = env.SENDGRID_API_KEY;
  const from = env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !from) return 'not_configured';

  const { subject, text, html } = buildAdminLinkEmail(msg);
  try {
    const res = await fetcher(SENDGRID_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: msg.to }] }],
        from: env.SENDGRID_FROM_NAME ? { email: from, name: env.SENDGRID_FROM_NAME } : { email: from },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
        // The admin link carries the organizer secret; don't let click tracking
        // rewrite it through a third-party redirect.
        tracking_settings: { click_tracking: { enable: false, enable_text: false } },
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`SendGrid rejected admin-link email: HTTP ${res.status} ${await res.text().catch(() => '')}`);
      return 'failed';
    }
    return 'sent';
  } catch (e) {
    console.error('SendGrid admin-link email failed:', e);
    return 'failed';
  }
}
