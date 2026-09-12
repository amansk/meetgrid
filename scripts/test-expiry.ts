/**
 * Retention rule, checked against the cases that matter: a poll whose meeting is
 * still ahead of it must survive even when it was created long ago, and a poll
 * nobody has touched in a month must go.
 */
import { findExpiredPolls, RETENTION_DAYS } from '../src/lib/expiry';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-12T16:00:00.000Z');

interface Row {
  id: string;
  title: string;
  created_at: number;
  last_slot_end: string | null;
  last_response_at: number | null;
}

/** Stand-in for D1: serves one prepared statement, the one findExpiredPolls uses. */
function fakeDb(rows: Row[]): D1Database {
  return {
    prepare() {
      return {
        bind(cutoff: number) {
          return {
            async all() {
              return { results: rows.filter((r) => r.created_at < cutoff) };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

const rows: Row[] = [
  {
    // Amandeep's real YPO poll shape: created today, last slot Oct 31.
    id: 'live-future-slots',
    title: 'YPO forum',
    created_at: NOW,
    last_slot_end: '2026-10-31T17:00:00.000Z',
    last_response_at: NOW,
  },
  {
    // Created 40 days ago, but the meeting itself has not happened yet.
    id: 'old-poll-future-meeting',
    title: 'Booked well ahead',
    created_at: NOW - 40 * DAY,
    last_slot_end: '2026-10-20T17:00:00.000Z',
    last_response_at: NOW - 40 * DAY,
  },
  {
    // Meeting was 31 days ago and nobody has touched it since.
    id: 'done-and-cold',
    title: 'Long finished',
    created_at: NOW - 70 * DAY,
    last_slot_end: new Date(NOW - 31 * DAY).toISOString(),
    last_response_at: NOW - 60 * DAY,
  },
  {
    // Meeting was 40 days ago, but somebody edited a response last week.
    id: 'cold-slots-recent-edit',
    title: 'Still being argued about',
    created_at: NOW - 80 * DAY,
    last_slot_end: new Date(NOW - 40 * DAY).toISOString(),
    last_response_at: NOW - 7 * DAY,
  },
  {
    // Meeting 29 days ago: one day inside the window.
    id: 'just-inside-window',
    title: 'Only just finished',
    created_at: NOW - 60 * DAY,
    last_slot_end: new Date(NOW - 29 * DAY).toISOString(),
    last_response_at: null,
  },
  {
    // No slots and no responses at all — falls back to creation date.
    id: 'empty-and-ancient',
    title: 'Abandoned',
    created_at: NOW - 45 * DAY,
    last_slot_end: null,
    last_response_at: null,
  },
  {
    // A malformed slot end must not rescue a poll from expiry by accident.
    id: 'malformed-slot-end',
    title: 'Bad data',
    created_at: NOW - 50 * DAY,
    last_slot_end: 'not-a-date',
    last_response_at: null,
  },
];

const EXPECTED_GONE = new Set([
  'done-and-cold',
  'empty-and-ancient',
  'malformed-slot-end',
]);

async function main() {
const expired = await findExpiredPolls(fakeDb(rows), NOW);
const gone = new Set(expired.map((p) => p.id));

let failures = 0;
for (const row of rows) {
  const shouldGo = EXPECTED_GONE.has(row.id);
  const didGo = gone.has(row.id);
  if (shouldGo !== didGo) {
    failures++;
    console.error(
      `FAIL ${row.id}: expected ${shouldGo ? 'deleted' : 'kept'}, got ${didGo ? 'deleted' : 'kept'}`
    );
  } else {
    console.log(`  ${didGo ? 'deleted' : 'kept   '}  ${row.id}`);
  }
}

if (failures) {
  console.error(`\n${failures} case(s) wrong`);
  process.exit(1);
}
console.log(`\nPASS: retention of ${RETENTION_DAYS} days counts from last activity, not creation`);
}

main();
