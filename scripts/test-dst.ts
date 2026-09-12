/**
 * DST assertions for America/Los_Angeles:
 *  - spring-forward (2026-03-08): times that do not exist are dropped, and every
 *    slot that survives runs forwards.
 *  - fall-back (2026-11-01): the 1:00–2:00 AM slot exists — twice over, in wall
 *    time — and must still be offered, so the window is not silently short.
 */
import { generateSlots } from '../src/lib/slots';
import { slotDurationMinutes } from '../src/lib/timezone';

const slots = generateSlots({
  start_date: '2026-03-08',
  end_date: '2026-03-08',
  daily_start: '01:00',
  daily_end: '04:00',
  duration_minutes: 30,
  timezone: 'America/Los_Angeles',
});

let failed = false;

for (const slot of slots) {
  const duration = slotDurationMinutes(slot.start_utc, slot.end_utc);
  if (slot.start_utc >= slot.end_utc) {
    console.error('FAIL: zero or negative duration slot', slot);
    failed = true;
  }
  if (Math.abs(duration - 30) > 0.001) {
    console.error('FAIL: unexpected duration', duration, slot);
    failed = true;
  }
}

if (slots.length === 0) {
  console.error('FAIL: no slots generated');
  failed = true;
}

// Fall-back day: 00:00–05:00 at 60 minutes must offer all five hourly slots,
// including 1:00–2:00 AM, which elapses over two real hours that morning.
const fallBack = generateSlots({
  start_date: '2026-11-01',
  end_date: '2026-11-01',
  daily_start: '00:00',
  daily_end: '05:00',
  duration_minutes: 60,
  timezone: 'America/Los_Angeles',
});

if (fallBack.length !== 5) {
  console.error(`FAIL: DST fall-back produced ${fallBack.length} slots, expected 5`);
  failed = true;
}

for (const slot of fallBack) {
  if (slot.start_utc >= slot.end_utc) {
    console.error('FAIL: zero or negative duration slot', slot);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log(`PASS: DST spring-forward produced ${slots.length} valid slots`);
for (const s of slots) {
  console.log(`  ${s.start_utc} → ${s.end_utc}`);
}

console.log(`PASS: DST fall-back produced ${fallBack.length} valid slots`);
for (const s of fallBack) {
  console.log(`  ${s.start_utc} → ${s.end_utc}`);
}
