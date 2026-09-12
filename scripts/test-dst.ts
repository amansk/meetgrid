/**
 * DST spring-forward assertion: America/Los_Angeles 2026-03-08 01:00–04:00 window
 * must not produce zero-duration or invalid-duration slots.
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

if (failed) {
  process.exit(1);
}

console.log(`PASS: DST spring-forward produced ${slots.length} valid slots`);
for (const s of slots) {
  console.log(`  ${s.start_utc} → ${s.end_utc}`);
}
