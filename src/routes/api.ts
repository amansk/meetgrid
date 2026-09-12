import { Hono } from 'hono';
import {
  closePoll,
  deleteSlots,
  getPoll,
  getRespondents,
  getSlots,
  getVotesForPoll,
  insertPoll,
  insertRespondent,
  insertSlots,
  rotateEditToken,
  setPollDecision,
  updateRespondentIdentity,
  replaceVotes,
} from '../db/queries';
import {
  daysBetween,
  MAX_POLL_DAYS,
  MAX_SLOTS,
  parsePollId,
  resolveCreatePollId,
} from '../lib/validate';
import { generateId, generateSecret, hashSecret, verifySecret } from '../lib/crypto';
import { generateUniquePollId } from '../lib/expiry';
import { buildPollView } from '../lib/poll-view';
import { clientKey, checkRateLimit } from '../lib/rate-limit';
import { buildExplicitSlots, defaultPollDuration, generatedSlotsToLocal } from '../lib/explicit-slots';
import { generateSlots } from '../lib/slots';
import { isValidTimezone } from '../lib/timezone';
import type { CreatePollBody, Env, RespondBody } from '../types';
import type { GeneratedSlot } from '../lib/slots';

const api = new Hono<{ Bindings: Env }>();

function jsonError(message: string, status = 400, code?: string) {
  return Response.json(code ? { error: message, code } : { error: message }, { status });
}

function pollIdParam(raw: string): string | null {
  return parsePollId(raw);
}

/**
 * Addresses are matched and stored lower-cased: the same person typing
 * "Dave@Example.com" on a second device has to land on the same respondent, and
 * the address is never rendered back to participants, so case carries nothing.
 */
function normalizeEmail(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim().toLocaleLowerCase();
  return trimmed ? trimmed : null;
}

/** Deliberately loose: a shape check, not an attempt to decide deliverability. */
function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

async function loadPublicPoll(db: D1Database, pollId: string) {
  const poll = await getPoll(db, pollId);
  if (!poll) return null;
  const slots = await getSlots(db, pollId);
  const respondents = await getRespondents(db, pollId);
  const votes = await getVotesForPoll(db, pollId);
  return buildPollView(poll, slots, respondents, votes);
}

function resolveCreateSlots(body: CreatePollBody): GeneratedSlot[] {
  const { timezone, slots, start_date, end_date, daily_start, daily_end, duration_minutes, weekdays } =
    body;

  if (slots?.length) {
    return buildExplicitSlots(slots, timezone);
  }

  if (!start_date || !end_date || !daily_start || !daily_end) {
    throw new Error('Provide slots array, or start_date, end_date, daily_start, daily_end for range generation');
  }
  if (!duration_minutes || duration_minutes < 15) {
    throw new Error('duration_minutes must be at least 15 when using range generation');
  }
  if (end_date < start_date) {
    throw new Error('end_date must be on or after start_date');
  }
  if (daysBetween(start_date, end_date) > MAX_POLL_DAYS) {
    throw new Error(`Date range cannot exceed ${MAX_POLL_DAYS} days`);
  }

  return generateSlots({
    start_date,
    end_date,
    daily_start,
    daily_end,
    duration_minutes,
    timezone,
    weekdays,
  });
}

async function verifyOrganizer(db: D1Database, pollId: string, secret: string) {
  const poll = await getPoll(db, pollId);
  if (!poll) return { error: 'Poll not found', status: 404 as const, poll: null };
  const ok = await verifySecret(secret, poll.organizer_secret_hash);
  if (!ok) return { error: 'Invalid organizer secret', status: 403 as const, poll: null };
  return { error: null, status: 200 as const, poll };
}

api.post('/polls', async (c) => {
  if (!(await checkRateLimit(c.env, clientKey(c.req.raw)))) {
    return jsonError('Rate limit exceeded', 429);
  }

  let body: CreatePollBody;
  try {
    body = await c.req.json<CreatePollBody>();
  } catch {
    return jsonError('Invalid JSON body');
  }

  const { title, notes, timezone, slots: explicitSlots, duration_minutes } = body;

  if (!title?.trim()) return jsonError('title is required');
  if (!timezone || !isValidTimezone(timezone)) return jsonError('Valid timezone is required');

  let slots: GeneratedSlot[];
  try {
    slots = resolveCreateSlots(body);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Invalid slot configuration');
  }

  if (!slots.length) return jsonError('At least one slot is required');
  if (slots.length > MAX_SLOTS) {
    return jsonError(
      `Too many slots (${slots.length}) — maximum is ${MAX_SLOTS}. Remove some times or shorten the range.`
    );
  }

  const pollDuration =
    duration_minutes ??
    (explicitSlots?.length ? defaultPollDuration(explicitSlots) : body.duration_minutes ?? 30);

  const idResult = resolveCreatePollId(body);
  if (!idResult.ok) return jsonError(idResult.error);

  let pollId: string;
  if (idResult.pollId) {
    const existing = await getPoll(c.env.DB, idResult.pollId);
    if (existing) {
      return jsonError(`Poll link "${idResult.pollId}" is already taken`, 409);
    }
    pollId = idResult.pollId;
  } else {
    pollId = await generateUniquePollId(c.env.DB);
  }
  const organizerSecret = generateSecret();
  const organizerSecretHash = await hashSecret(organizerSecret);
  const now = Date.now();

  await insertPoll(c.env.DB, {
    id: pollId,
    title: title.trim(),
    notes: notes?.trim() || null,
    timezone,
    duration_minutes: pollDuration,
    organizer_secret_hash: organizerSecretHash,
    created_at: now,
  });
  await insertSlots(c.env.DB, pollId, slots);

  const origin = new URL(c.req.url).origin;
  return c.json({
    poll_id: pollId,
    organizer_secret: organizerSecret,
    poll_url: `${origin}/p/${pollId}`,
    results_url: `${origin}/p/${pollId}/results`,
    organizer_url: `${origin}/p/${pollId}/results?secret=${encodeURIComponent(organizerSecret)}`,
    slot_count: slots.length,
  });
});

/** Preview range-generated slots as local date/time for the create UI. */
api.post('/slots/generate', async (c) => {
  if (!(await checkRateLimit(c.env, clientKey(c.req.raw)))) {
    return jsonError('Rate limit exceeded', 429);
  }

  let body: CreatePollBody;
  try {
    body = await c.req.json<CreatePollBody>();
  } catch {
    return jsonError('Invalid JSON body');
  }

  const { timezone, duration_minutes, start_date, end_date, daily_start, daily_end, weekdays } = body;

  if (!timezone || !isValidTimezone(timezone)) return jsonError('Valid timezone is required');
  if (!duration_minutes || duration_minutes < 15) return jsonError('duration_minutes must be at least 15');
  if (!start_date || !end_date || !daily_start || !daily_end) {
    return jsonError('start_date, end_date, daily_start, daily_end are required');
  }

  let generated: GeneratedSlot[];
  try {
    generated = resolveCreateSlots({ ...body, slots: undefined });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Invalid range configuration');
  }

  if (!generated.length) return jsonError('No slots generated — adjust your date range or time window');
  if (generated.length > MAX_SLOTS) {
    return jsonError(
      `Too many slots (${generated.length}) — maximum is ${MAX_SLOTS}. Shorten the date range or daily window.`
    );
  }

  return c.json({ slots: generatedSlotsToLocal(generated, timezone) });
});

api.get('/polls/:id', async (c) => {
  const pollId = pollIdParam(c.req.param('id'));
  if (!pollId) return jsonError('Poll not found', 404);
  const view = await loadPublicPoll(c.env.DB, pollId);
  if (!view) return jsonError('Poll not found', 404);
  return c.json(view);
});

api.get('/polls/:id/my-response', async (c) => {
  if (!(await checkRateLimit(c.env, clientKey(c.req.raw)))) {
    return jsonError('Rate limit exceeded', 429);
  }

  const pollId = pollIdParam(c.req.param('id'));
  if (!pollId) return jsonError('Poll not found', 404);
  const editToken = c.req.query('edit_token');
  if (!editToken) return jsonError('edit_token query param is required');

  const poll = await getPoll(c.env.DB, pollId);
  if (!poll) return jsonError('Poll not found', 404);

  const respondents = await getRespondents(c.env.DB, pollId);
  let matched = null as (typeof respondents)[0] | null;
  for (const r of respondents) {
    if (await verifySecret(editToken, r.edit_token_hash)) {
      matched = r;
      break;
    }
  }
  if (!matched) return jsonError('Invalid edit token', 403);

  const votes = await getVotesForPoll(c.env.DB, pollId);
  const myVotes: Record<string, boolean> = {};
  for (const v of votes.filter((x) => x.respondent_id === matched!.id)) {
    myVotes[v.slot_id] = v.yes === 1;
  }

  return c.json({
    respondent_id: matched.id,
    name: matched.name,
    email: matched.email,
    votes: myVotes,
  });
});

api.post('/polls/:id/respond', async (c) => {
  if (!(await checkRateLimit(c.env, clientKey(c.req.raw)))) {
    return jsonError('Rate limit exceeded', 429);
  }

  const pollId = pollIdParam(c.req.param('id'));
  if (!pollId) return jsonError('Poll not found', 404);
  const poll = await getPoll(c.env.DB, pollId);
  if (!poll) return jsonError('Poll not found', 404);
  if (poll.status === 'closed') return jsonError('Poll is closed', 403);

  let body: RespondBody;
  try {
    body = await c.req.json<RespondBody>();
  } catch {
    return jsonError('Invalid JSON body');
  }

  if (!body.name?.trim()) return jsonError('name is required');
  if (!Array.isArray(body.votes)) return jsonError('votes array is required');

  const email = normalizeEmail(body.email);
  if (email && !looksLikeEmail(email)) return jsonError('email does not look like an address');

  const slots = await getSlots(c.env.DB, pollId);
  const slotIds = new Set(slots.map((s) => s.id));
  for (const v of body.votes) {
    if (!slotIds.has(v.slot_id)) return jsonError(`Unknown slot_id: ${v.slot_id}`);
  }

  const now = Date.now();
  let respondentId: string;
  let editToken: string;
  let replacedExisting = false;

  if (body.edit_token) {
    const respondents = await getRespondents(c.env.DB, pollId);
    let matched: (typeof respondents)[0] | null = null;
    for (const r of respondents) {
      if (await verifySecret(body.edit_token, r.edit_token_hash)) {
        matched = r;
        break;
      }
    }
    if (!matched) return jsonError('Invalid edit token', 403);
    respondentId = matched.id;
    editToken = body.edit_token;
    replacedExisting = true;
    await updateRespondentIdentity(c.env.DB, respondentId, body.name.trim(), email, now);
  } else {
    if (!email) return jsonError('email is required', 400, 'email_required');

    const existing = await getRespondents(c.env.DB, pollId);
    const sameAddress = existing.find((r) => normalizeEmail(r.email) === email);

    if (sameAddress) {
      // The address is the identity: one person answering again from a second
      // device, or after clearing cookies, updates the response they already have
      // rather than appearing twice in every tally. Their votes are on the public
      // results page already, so nothing private is exposed by letting an address
      // alone claim them — and refusing instead would lock somebody out of their
      // own response with no way back, since we cannot mail them their edit link.
      respondentId = sameAddress.id;
      replacedExisting = true;
      // Only the hash of the original token is stored, so it cannot be handed
      // back; issue a fresh one and retire the old edit link.
      editToken = generateSecret();
      await rotateEditToken(c.env.DB, respondentId, await hashSecret(editToken), now);
      await updateRespondentIdentity(c.env.DB, respondentId, body.name.trim(), email, now);
    } else {
      // Two people called Dave with different addresses are two people, and go
      // through cleanly. The name check below only bites on responses recorded
      // before addresses were collected, where a name is all there is to match on.
      if (!body.allow_duplicate_name) {
        const wanted = body.name.trim().toLocaleLowerCase();
        const legacyNameClash = existing.some(
          (r) => !normalizeEmail(r.email) && r.name.trim().toLocaleLowerCase() === wanted
        );
        if (legacyNameClash) {
          return jsonError(
            `"${body.name.trim()}" already answered this poll before email addresses were collected, so there is no way to tell whether that was you. Open your edit link to change that response, or send this again to be added as a separate person.`,
            409,
            'duplicate_name'
          );
        }
      }

      respondentId = generateId();
      editToken = generateSecret();
      const editTokenHash = await hashSecret(editToken);
      await insertRespondent(c.env.DB, {
        id: respondentId,
        poll_id: pollId,
        name: body.name.trim(),
        email,
        edit_token_hash: editTokenHash,
        created_at: now,
        updated_at: now,
      });
    }
  }

  await replaceVotes(c.env.DB, respondentId, body.votes);

  const view = await loadPublicPoll(c.env.DB, pollId);
  return c.json({
    respondent_id: respondentId,
    edit_token: editToken,
    replaced_existing: replacedExisting,
    poll: view,
  });
});

api.post('/polls/:id/decision', async (c) => {
  if (!(await checkRateLimit(c.env, clientKey(c.req.raw)))) {
    return jsonError('Rate limit exceeded', 429);
  }

  const pollId = pollIdParam(c.req.param('id'));
  if (!pollId) return jsonError('Poll not found', 404);
  let body: { organizer_secret?: string; slot_id?: string };
  try {
    body = await c.req.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  if (!body.organizer_secret) return jsonError('organizer_secret is required');
  if (!body.slot_id) return jsonError('slot_id is required');

  const auth = await verifyOrganizer(c.env.DB, pollId, body.organizer_secret);
  if (auth.error) return jsonError(auth.error, auth.status);
  if (auth.poll!.status === 'closed') return jsonError('Poll is closed', 403);

  const slots = await getSlots(c.env.DB, pollId);
  if (!slots.some((s) => s.id === body.slot_id)) {
    return jsonError('slot_id not found in poll');
  }

  await setPollDecision(c.env.DB, pollId, body.slot_id!);
  const view = await loadPublicPoll(c.env.DB, pollId);
  return c.json({ ok: true, poll: view });
});

api.post('/polls/:id/close', async (c) => {
  if (!(await checkRateLimit(c.env, clientKey(c.req.raw)))) {
    return jsonError('Rate limit exceeded', 429);
  }

  const pollId = pollIdParam(c.req.param('id'));
  if (!pollId) return jsonError('Poll not found', 404);
  let body: { organizer_secret?: string };
  try {
    body = await c.req.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  if (!body.organizer_secret) return jsonError('organizer_secret is required');

  const auth = await verifyOrganizer(c.env.DB, pollId, body.organizer_secret);
  if (auth.error) return jsonError(auth.error, auth.status);

  await closePoll(c.env.DB, pollId);
  const view = await loadPublicPoll(c.env.DB, pollId);
  return c.json({ ok: true, poll: view });
});

/**
 * Organizer-only contact list. Addresses are collected so the organizer can
 * follow up and send the invite for the time that wins, so they are readable
 * here and nowhere else: the public poll view never carries an address, which is
 * why this is a separate call rather than a field on GET /polls/:id.
 */
api.post('/polls/:id/contacts', async (c) => {
  if (!(await checkRateLimit(c.env, clientKey(c.req.raw)))) {
    return jsonError('Rate limit exceeded', 429);
  }

  const pollId = pollIdParam(c.req.param('id'));
  if (!pollId) return jsonError('Poll not found', 404);
  let body: { organizer_secret?: string };
  try {
    body = await c.req.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  if (!body.organizer_secret) return jsonError('organizer_secret is required');

  const auth = await verifyOrganizer(c.env.DB, pollId, body.organizer_secret);
  if (auth.error) return jsonError(auth.error, auth.status);

  const respondents = await getRespondents(c.env.DB, pollId);
  return c.json({
    respondents: respondents.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
    })),
  });
});

api.post('/polls/:id/slots', async (c) => {
  if (!(await checkRateLimit(c.env, clientKey(c.req.raw)))) {
    return jsonError('Rate limit exceeded', 429);
  }

  const pollId = pollIdParam(c.req.param('id'));
  if (!pollId) return jsonError('Poll not found', 404);
  let body: {
    organizer_secret?: string;
    add?: Array<{ start_utc: string; end_utc: string }>;
    remove?: string[];
  };
  try {
    body = await c.req.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  if (!body.organizer_secret) return jsonError('organizer_secret is required');

  const auth = await verifyOrganizer(c.env.DB, pollId, body.organizer_secret);
  if (auth.error) return jsonError(auth.error, auth.status);
  if (auth.poll!.status === 'closed') return jsonError('Poll is closed', 403);

  if (body.remove?.length) {
    await deleteSlots(c.env.DB, pollId, body.remove);
  }

  if (body.add?.length) {
    const existing = await getSlots(c.env.DB, pollId);
    let sortOrder = existing.length;
    const newSlots = body.add.map((s) => ({
      id: generateId(),
      start_utc: s.start_utc,
      end_utc: s.end_utc,
      sort_order: sortOrder++,
    }));
    await insertSlots(c.env.DB, pollId, newSlots);
  }

  const view = await loadPublicPoll(c.env.DB, pollId);
  return c.json({ ok: true, poll: view });
});

export default api;
