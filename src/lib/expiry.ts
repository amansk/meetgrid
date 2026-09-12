import { deletePoll, getPoll } from '../db/queries';
import { generateId } from './crypto';
import { RESERVED_POLL_SLUGS } from './validate';

/** Polls are kept for this long after the last thing that happens to them. */
export const RETENTION_DAYS = 30;

/**
 * Ceiling on one sweep. Nothing should ever delete hundreds of polls in a run,
 * so if something does, it stops and says so in the logs rather than emptying
 * the database while nobody is watching. The next run picks up the rest.
 */
export const MAX_DELETES_PER_RUN = 200;

/** New polls get a short, typeable id. Longer ids already in the wild keep working. */
export const NEW_POLL_ID_LENGTH = 4;

/**
 * A short id collides far more often than a long one — a few thousand polls in a
 * 14.8 million id space makes a birthday collision likely — and the insert would
 * fail on the primary key. So check before using one, and lengthen rather than
 * fail if the space is genuinely crowded.
 */
export async function generateUniquePollId(db: D1Database): Promise<string> {
  for (const length of [NEW_POLL_ID_LENGTH, NEW_POLL_ID_LENGTH, NEW_POLL_ID_LENGTH, 6, 8, 12]) {
    const candidate = generateId(length);
    if (RESERVED_POLL_SLUGS.has(candidate.toLowerCase())) continue;
    if (!(await getPoll(db, candidate))) return candidate;
  }
  return generateId(16);
}

export interface ExpiredPoll {
  id: string;
  title: string;
  /** The most recent of: created, last slot ending, last response edited. */
  last_activity_ms: number;
}

/**
 * Expiry counts from the last thing that happened to a poll, not from when it
 * was created: a poll set up in September for a meeting on Halloween is still
 * live, and counting from creation would delete it out from under everyone. The
 * basis is therefore the latest of the poll's creation, its final slot's end,
 * and the most recent response edit.
 */
export async function findExpiredPolls(
  db: D1Database,
  nowMs: number,
  retentionDays = RETENTION_DAYS
): Promise<ExpiredPoll[]> {
  const cutoffMs = nowMs - retentionDays * 86_400_000;

  // A poll's basis is never earlier than its creation, so anything created after
  // the cutoff cannot be expired and need not be examined.
  const { results } = await db
    .prepare(
      `SELECT p.id, p.title, p.created_at,
              (SELECT MAX(end_utc) FROM slots WHERE poll_id = p.id) AS last_slot_end,
              (SELECT MAX(updated_at) FROM respondents WHERE poll_id = p.id) AS last_response_at
       FROM polls p
       WHERE p.created_at < ?
       ORDER BY p.created_at ASC`
    )
    .bind(cutoffMs)
    .all<{
      id: string;
      title: string;
      created_at: number;
      last_slot_end: string | null;
      last_response_at: number | null;
    }>();

  const expired: ExpiredPoll[] = [];
  for (const row of results ?? []) {
    // Slot ends are ISO-8601 UTC strings; parsed rather than compared as text so
    // a malformed one fails closed, below, instead of sorting unpredictably.
    const slotEndMs = row.last_slot_end ? Date.parse(row.last_slot_end) : NaN;
    const lastActivity = Math.max(
      row.created_at,
      Number.isNaN(slotEndMs) ? 0 : slotEndMs,
      row.last_response_at ?? 0
    );
    if (lastActivity < cutoffMs) {
      expired.push({ id: row.id, title: row.title, last_activity_ms: lastActivity });
    }
  }
  return expired;
}

export interface SweepResult {
  deleted: ExpiredPoll[];
  /** True when the cap was hit and more remain for the next run. */
  capped: boolean;
}

/** Delete every poll whose retention window has passed, up to the per-run cap. */
export async function sweepExpiredPolls(
  db: D1Database,
  nowMs: number,
  retentionDays = RETENTION_DAYS
): Promise<SweepResult> {
  const expired = await findExpiredPolls(db, nowMs, retentionDays);
  const batch = expired.slice(0, MAX_DELETES_PER_RUN);

  for (const poll of batch) {
    await deletePoll(db, poll.id);
  }

  return { deleted: batch, capped: expired.length > batch.length };
}
