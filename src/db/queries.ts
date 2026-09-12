import type { GeneratedSlot } from '../lib/slots';
import type { PollRow, RespondentRow, SlotRow, VoteRow } from '../types';

export async function insertPoll(
  db: D1Database,
  poll: Omit<PollRow, 'status' | 'chosen_slot_id'> & { status?: string; chosen_slot_id?: string | null }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO polls (id, title, notes, timezone, duration_minutes, organizer_secret_hash, status, chosen_slot_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      poll.id,
      poll.title,
      poll.notes,
      poll.timezone,
      poll.duration_minutes,
      poll.organizer_secret_hash,
      poll.status ?? 'open',
      poll.chosen_slot_id ?? null,
      poll.created_at
    )
    .run();
}

export async function insertSlots(db: D1Database, pollId: string, slots: GeneratedSlot[]): Promise<void> {
  const stmts = slots.map((s) =>
    db
      .prepare('INSERT INTO slots (id, poll_id, start_utc, end_utc, sort_order) VALUES (?, ?, ?, ?, ?)')
      .bind(s.id, pollId, s.start_utc, s.end_utc, s.sort_order)
  );
  if (stmts.length) await db.batch(stmts);
}

export async function getPoll(db: D1Database, pollId: string): Promise<PollRow | null> {
  return db.prepare('SELECT * FROM polls WHERE id = ?').bind(pollId).first<PollRow>();
}

export async function getSlots(db: D1Database, pollId: string): Promise<SlotRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM slots WHERE poll_id = ? ORDER BY sort_order ASC')
    .bind(pollId)
    .all<SlotRow>();
  return results ?? [];
}

export async function getRespondents(db: D1Database, pollId: string): Promise<RespondentRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM respondents WHERE poll_id = ? ORDER BY created_at ASC')
    .bind(pollId)
    .all<RespondentRow>();
  return results ?? [];
}

export async function getVotesForPoll(db: D1Database, pollId: string): Promise<VoteRow[]> {
  const { results } = await db
    .prepare(
      `SELECT v.respondent_id, v.slot_id, v.yes
       FROM votes v
       JOIN respondents r ON r.id = v.respondent_id
       WHERE r.poll_id = ?`
    )
    .bind(pollId)
    .all<VoteRow>();
  return results ?? [];
}

export async function getRespondentById(
  db: D1Database,
  respondentId: string
): Promise<RespondentRow | null> {
  return db.prepare('SELECT * FROM respondents WHERE id = ?').bind(respondentId).first<RespondentRow>();
}

export async function insertRespondent(
  db: D1Database,
  respondent: RespondentRow
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO respondents (id, poll_id, name, edit_token_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      respondent.id,
      respondent.poll_id,
      respondent.name,
      respondent.edit_token_hash,
      respondent.created_at,
      respondent.updated_at
    )
    .run();
}

export async function updateRespondentName(
  db: D1Database,
  respondentId: string,
  name: string,
  now: number
): Promise<void> {
  await db
    .prepare('UPDATE respondents SET name = ?, updated_at = ? WHERE id = ?')
    .bind(name, now, respondentId)
    .run();
}

export async function upsertVotes(
  db: D1Database,
  respondentId: string,
  votes: Array<{ slot_id: string; yes: boolean }>
): Promise<void> {
  const stmts = votes.map((v) =>
    db
      .prepare(
        `INSERT INTO votes (respondent_id, slot_id, yes) VALUES (?, ?, ?)
         ON CONFLICT(respondent_id, slot_id) DO UPDATE SET yes = excluded.yes`
      )
      .bind(respondentId, v.slot_id, v.yes ? 1 : 0)
  );
  if (stmts.length) await db.batch(stmts);
}

export async function setPollDecision(
  db: D1Database,
  pollId: string,
  slotId: string
): Promise<void> {
  await db
    .prepare('UPDATE polls SET chosen_slot_id = ? WHERE id = ?')
    .bind(slotId, pollId)
    .run();
}

export async function closePoll(db: D1Database, pollId: string): Promise<void> {
  await db.prepare("UPDATE polls SET status = 'closed' WHERE id = ?").bind(pollId).run();
}

export async function deleteSlots(db: D1Database, pollId: string, slotIds: string[]): Promise<void> {
  const stmts = slotIds.map((id) =>
    db.prepare('DELETE FROM slots WHERE id = ? AND poll_id = ?').bind(id, pollId)
  );
  if (stmts.length) await db.batch(stmts);
}
