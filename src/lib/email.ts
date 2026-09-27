import type { Env } from '../types';

const RESEND_URL = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 5000;
/** Resend's API limit is a few requests per second shared across the account. */
const MAX_RETRY_WAIT_MS = 2000;

/** Deliberately loose: catches typos like a missing @, leaves the rest to Resend. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export type EmailStatus = 'sent' | 'not_configured' | 'failed';

export type EmailFetcher = (input: string, init: RequestInit) => Promise<Response>;
export type Sleeper = (ms: number) => Promise<void>;

/** How long a 429 asks us to wait, or null if it's longer than we'll hold the request for. */
function retryDelayMs(res: Response): number | null {
  const header = res.headers.get('retry-after') ?? res.headers.get('ratelimit-reset');
  const seconds = header === null ? 1 : Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const ms = Math.max(seconds * 1000, 100);
  return ms <= MAX_RETRY_WAIT_MS ? ms : null;
}

export function parseEmail(raw: string): string | null {
  const email = raw.trim();
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) return null;
  return email;
}

/** Resend takes the sender as "Name <address>" when a display name is set. */
function formatFrom(email: string, name?: string): string {
  if (!name) return email;
  return `"${name.replace(/["\\\r\n]/g, '')}" <${email}>`;
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
 * Email the organizer their admin link through Resend. Never throws: poll
 * creation has already succeeded by the time this runs, and a missing key or a
 * Resend outage must not turn that into an error for the caller.
 */
export async function sendAdminLinkEmail(
  env: Env,
  msg: AdminLinkEmail,
  fetcher: EmailFetcher = (input, init) => fetch(input, init),
  sleep: Sleeper = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<EmailStatus> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return 'not_configured';

  const { subject, text, html } = buildAdminLinkEmail(msg);
  // Same key on the retry, so Resend never delivers the email twice.
  const idempotencyKey = crypto.randomUUID();
  const send = () =>
    fetcher(RESEND_URL, {
      method: 'POST',
      // A followed redirect would forward the API key and the admin link to
      // wherever it points; fail instead.
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      // Resend's click tracking is a per-domain setting and off by default; keep
      // it off, since it would route the admin link (which carries the organizer
      // secret) through a third-party redirect.
      body: JSON.stringify({
        from: formatFrom(from, env.RESEND_FROM_NAME),
        to: [msg.to],
        subject,
        text,
        html,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  try {
    let res = await send();
    // The rate limit is shared by every poll being created, so a burst can
    // throttle an organizer who did nothing wrong. Wait it out once.
    const delay = res.status === 429 ? retryDelayMs(res) : null;
    if (delay !== null) {
      await sleep(delay);
      res = await send();
    }
    if (!res.ok) {
      console.error(`Resend rejected admin-link email: HTTP ${res.status} ${await res.text().catch(() => '')}`);
      return 'failed';
    }
    return 'sent';
  } catch (e) {
    console.error('Resend admin-link email failed:', e);
    return 'failed';
  }
}
