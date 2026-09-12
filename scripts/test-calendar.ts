/**
 * Calendar helper assertions: ICS escaping, UTC compaction, Google Calendar URL shape.
 */
import {
  buildIcs,
  escapeIcs,
  googleCalendarUrl,
  icsFilenameStem,
  utcToIcsDate,
} from '../src/lib/calendar';

let failed = false;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    failed = true;
  }
}

const startUtc = '2025-06-15T18:30:00.000Z';
const endUtc = '2025-06-15T19:30:00.000Z';

assert(utcToIcsDate(startUtc) === '20250615T183000Z', 'utcToIcsDate strips punctuation and ms');
assert(
  utcToIcsDate('2025-06-15T18:30:00.123Z') === '20250615T183000Z',
  'utcToIcsDate normalizes fractional seconds via Date'
);

const escaped = escapeIcs('A; B, C\\here\r\nand\nthere');
assert(
  escaped === 'A\\; B\\, C\\\\here\\nand\\nthere',
  'escapeIcs handles ; , \\ and newlines'
);

const ics = buildIcs({
  title: 'Meet; team',
  startUtc,
  endUtc,
  description: 'Notes\nline2',
  url: 'https://meetgrid.app/p/abc',
  uid: 'meetgrid-test@meetgrid.app',
});
assert(ics.includes('SUMMARY:Meet\\; team'), 'ICS SUMMARY escaped');
assert(ics.includes('DESCRIPTION:Notes\\nline2'), 'ICS DESCRIPTION newline escaped');
assert(ics.includes('URL:https://meetgrid.app/p/abc'), 'ICS URL present');
assert(ics.includes('DTSTART:20250615T183000Z'), 'ICS DTSTART UTC Z');
assert(ics.includes('DTEND:20250615T193000Z'), 'ICS DTEND UTC Z');
assert(!ics.includes('.000Z'), 'ICS dates have no fractional seconds');

const gcal = googleCalendarUrl({
  title: '<script>alert(1)</script>',
  startUtc,
  endUtc,
  details: 'details & more',
  ctz: 'America/Los_Angeles',
});
assert(gcal.includes('dates=20250615T183000Z%2F20250615T193000Z'), 'GCal dates are UTC Z');
assert(!gcal.includes('ctz='), 'GCal omits ctz when dates use Z (no double-shift)');
assert(gcal.includes('text=%3Cscript%3E'), 'GCal title URL-encoded (XSS-safe in href)');

// Production smoke (meetgrid.amandeep.app, post-#5): broken URL had both Z dates and ctz.
const prodStart = '2026-09-15T17:00:00.000Z';
const prodEnd = '2026-09-15T17:30:00.000Z';
const prodGcal = googleCalendarUrl({
  title: 'Smoke poll',
  startUtc: prodStart,
  endUtc: prodEnd,
  ctz: 'America/Los_Angeles',
});
assert(
  prodGcal.includes('dates=20260915T170000Z%2F20260915T173000Z'),
  'production-shaped GCal dates compact to UTC Z'
);
assert(!prodGcal.includes('ctz='), 'production bug fixed: no ctz with Z dates');

assert(ics.includes('\r\n'), 'ICS uses CRLF line endings');

assert(icsFilenameStem('Team Sync!!!') === 'Team-Sync', 'ics filename stem sanitizes title');
assert(icsFilenameStem('!!!') === 'event', 'ics filename stem fallback');

if (failed) {
  process.exit(1);
}

console.log('PASS: calendar helpers (ICS, GCal URL, escape)');
