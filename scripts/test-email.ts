/**
 * Admin-link email: what goes to SendGrid, and that every way it can go wrong
 * comes back as a status rather than an exception that would fail poll creation.
 */
import { buildAdminLinkEmail, parseEmail, sendAdminLinkEmail, type EmailFetcher } from '../src/lib/email';
import type { Env } from '../src/types';

let failed = false;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    failed = true;
  }
}

const env = { SENDGRID_API_KEY: 'SG.test', SENDGRID_FROM_EMAIL: 'polls@example.com' } as Env;
const msg = {
  to: 'organizer@example.com',
  title: 'Team <sync> & "lunch"',
  pollUrl: 'https://meetgrid.test/p/abcd',
  organizerUrl: 'https://meetgrid.test/p/abcd/results?secret=s3cr3t',
};

assert(parseEmail('  a@b.co ') === 'a@b.co', 'parseEmail trims a valid address');
assert(parseEmail('not-an-email') === null, 'parseEmail rejects a missing @');
assert(parseEmail('a@b') === null, 'parseEmail rejects a missing dot in the domain');
assert(parseEmail('a b@c.co') === null, 'parseEmail rejects whitespace');

const built = buildAdminLinkEmail(msg);
assert(built.text.includes(msg.organizerUrl), 'text body carries the admin link');
assert(built.text.includes(msg.pollUrl), 'text body carries the participant link');
assert(built.html.includes('Team &lt;sync&gt; &amp; &quot;lunch&quot;'), 'html body escapes the title');
assert(!built.html.includes('<sync>'), 'html body has no raw title markup');

async function run(): Promise<void> {
  let captured: { url: string; init: RequestInit } | null = null;
  const ok: EmailFetcher = async (url, init) => {
    captured = { url, init };
    return new Response(null, { status: 202 });
  };
  assert((await sendAdminLinkEmail(env, msg, ok)) === 'sent', '202 from SendGrid is sent');
  const call = captured as { url: string; init: RequestInit } | null;
  assert(call?.url === 'https://api.sendgrid.com/v3/mail/send', 'posts to the SendGrid v3 endpoint');
  assert(
    (call?.init.headers as Record<string, string>)?.Authorization === 'Bearer SG.test',
    'authenticates with the API key'
  );
  const payload = JSON.parse(String(call?.init.body));
  assert(payload.personalizations[0].to[0].email === msg.to, 'addressed to the organizer');
  assert(payload.from.email === 'polls@example.com', 'sent from the configured sender');
  assert(payload.tracking_settings.click_tracking.enable === false, 'click tracking is off');

  let called = false;
  const spy: EmailFetcher = async () => {
    called = true;
    return new Response(null, { status: 202 });
  };
  assert(
    (await sendAdminLinkEmail({ SENDGRID_FROM_EMAIL: 'x@y.co' } as Env, msg, spy)) === 'not_configured',
    'missing key is not_configured'
  );
  assert(
    (await sendAdminLinkEmail({ SENDGRID_API_KEY: 'k' } as Env, msg, spy)) === 'not_configured',
    'missing sender is not_configured'
  );
  assert(!called, 'nothing is sent when unconfigured');

  const rejected: EmailFetcher = async () => new Response('bad sender', { status: 403 });
  assert((await sendAdminLinkEmail(env, msg, rejected)) === 'failed', 'non-2xx is failed');

  const down: EmailFetcher = async () => {
    throw new Error('network down');
  };
  assert((await sendAdminLinkEmail(env, msg, down)) === 'failed', 'a thrown fetch is failed, not thrown');
}

run().then(() => {
  if (failed) process.exit(1);
  console.log('PASS: admin-link email (payload, escaping, graceful failure)');
});
