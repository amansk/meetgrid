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
  setPollDecision,
  updateRespondentName,
  upsertVotes,
} from '../db/queries';
import { generateId, generateSecret, hashSecret, verifySecret } from '../lib/crypto';
import { buildPollView } from '../lib/poll-view';
import { clientKey, checkRateLimit } from '../lib/rate-limit';
import { generateSlots, mergeExtraSlots } from '../lib/slots';
import { isValidTimezone } from '../lib/timezone';
import type { CreatePollBody, Env, RespondBody } from '../types';

const api = new Hono<{ Bindings: Env }>();

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function loadPublicPoll(db: D1Database, pollId: string) {
  const poll = await getPoll(db, pollId);
  if (!poll) return null;
  const slots = await getSlots(db, pollId);
  const respondents = await getRespondents(db, pollId);
  const votes = await getVotesForPoll(db, pollId);
  return buildPollView(poll, slots, respondents, votes);
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

  const {
    title,
    notes,
    timezone,
    duration_minutes,
    start_date,
    end_date,
    daily_start,
    daily_end,
    weekdays,
    extra_slots,
    remove_slot_ids,
  } = body;

  if (!title?.trim()) return jsonError('title is required');
  if (!timezone || !isValidTimezone(timezone)) return jsonError('Valid timezone is required');
  if (!duration_minutes || duration_minutes < 15) return jsonError('duration_minutes must be at least 15');
  if (!start_date || !end_date || !daily_start || !daily_end) {
    return jsonError('start_date, end_date, daily_start, daily_end are required');
  }

  let slots;
  try {
    slots = generateSlots({
      start_date,
      end_date,
      daily_start,
      daily_end,
      duration_minutes,
      timezone,
      weekdays,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Invalid slot configuration');
  }

  if (extra_slots?.length) {
    slots = mergeExtraSlots(slots, extra_slots);
  }
  if (remove_slot_ids?.length) {
    const removeSet = new Set(remove_slot_ids);
    slots = slots.filter((s) => !removeSet.has(s.id)).map((s, i) => ({ ...s, sort_order: i }));
  }
  if (!slots.length) return jsonError('No slots generated — adjust your date range or time window');

  const pollId = generateId(12);
  const organizerSecret = generateSecret();
  const organizerSecretHash = await hashSecret(organizerSecret);
  const now = Date.now();

  await insertPoll(c.env.DB, {
    id: pollId,
    title: title.trim(),
    notes: notes?.trim() || null,
    timezone,
    duration_minutes,
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

api.get('/polls/:id', async (c) => {
  const pollId = c.req.param('id');
  const view = await loadPublicPoll(c.env.DB, pollId);
  if (!view) return jsonError('Poll not found', 404);
  return c.json(view);
});

api.get('/polls/:id/my-response', async (c) => {
  const pollId = c.req.param('id');
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
    votes: myVotes,
  });
});

api.post('/polls/:id/respond', async (c) => {
  if (!(await checkRateLimit(c.env, clientKey(c.req.raw)))) {
    return jsonError('Rate limit exceeded', 429);
  }

  const pollId = c.req.param('id');
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

  const slots = await getSlots(c.env.DB, pollId);
  const slotIds = new Set(slots.map((s) => s.id));
  for (const v of body.votes) {
    if (!slotIds.has(v.slot_id)) return jsonError(`Unknown slot_id: ${v.slot_id}`);
  }

  const now = Date.now();
  let respondentId: string;
  let editToken: string;

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
    await updateRespondentName(c.env.DB, respondentId, body.name.trim(), now);
  } else {
    respondentId = generateId();
    editToken = generateSecret();
    const editTokenHash = await hashSecret(editToken);
    await insertRespondent(c.env.DB, {
      id: respondentId,
      poll_id: pollId,
      name: body.name.trim(),
      edit_token_hash: editTokenHash,
      created_at: now,
      updated_at: now,
    });
  }

  await upsertVotes(c.env.DB, respondentId, body.votes);

  const view = await loadPublicPoll(c.env.DB, pollId);
  return c.json({
    respondent_id: respondentId,
    edit_token: editToken,
    poll: view,
  });
});

api.post('/polls/:id/decision', async (c) => {
  if (!(await checkRateLimit(c.env, clientKey(c.req.raw)))) {
    return jsonError('Rate limit exceeded', 429);
  }

  const pollId = c.req.param('id');
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

  const pollId = c.req.param('id');
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

api.post('/polls/:id/slots', async (c) => {
  if (!(await checkRateLimit(c.env, clientKey(c.req.raw)))) {
    return jsonError('Rate limit exceeded', 429);
  }

  const pollId = c.req.param('id');
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
