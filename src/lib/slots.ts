import { generateId } from './crypto';
import {
  addDays,
  isoWeekdayInTimezone,
  localDateTimeToUtcIso,
  minutesToTime,
  parseTimeToMinutes,
  slotDurationMinutes,
} from './timezone';

export interface GeneratedSlot {
  id: string;
  start_utc: string;
  end_utc: string;
  sort_order: number;
}

export interface SlotGenerationInput {
  start_date: string;
  end_date: string;
  daily_start: string;
  daily_end: string;
  duration_minutes: number;
  timezone: string;
  weekdays?: number[];
}

/**
 * A generated slot is valid when both local endpoints exist in the timezone and
 * run forwards. Elapsed time may differ from the nominal duration on a DST
 * fall-back day — 1:00–2:00 AM is two real hours when the clocks go back — and
 * that slot is still the one the organizer asked for, so it is kept. Times that
 * do not exist at all (spring-forward gap) are dropped earlier, when
 * localDateTimeToUtcIso returns null.
 */
function isValidGeneratedSlot(slot: GeneratedSlot): boolean {
  return slot.start_utc < slot.end_utc;
}

export function generateSlots(input: SlotGenerationInput): GeneratedSlot[] {
  const {
    start_date,
    end_date,
    daily_start,
    daily_end,
    duration_minutes,
    timezone,
    weekdays,
  } = input;

  const windowStart = parseTimeToMinutes(daily_start);
  const windowEnd = parseTimeToMinutes(daily_end);
  if (windowEnd <= windowStart) {
    throw new Error('daily_end must be after daily_start');
  }
  if (duration_minutes < 15 || duration_minutes > 480) {
    throw new Error('duration_minutes must be between 15 and 480');
  }

  const slots: GeneratedSlot[] = [];
  let sortOrder = 0;
  let current = start_date;

  while (current <= end_date) {
    const includeDay =
      !weekdays?.length || weekdays.includes(isoWeekdayInTimezone(current, timezone));

    if (includeDay) {
      for (let startMin = windowStart; startMin + duration_minutes <= windowEnd; startMin += duration_minutes) {
        const endMin = startMin + duration_minutes;
        const startTime = minutesToTime(startMin);
        const endTime = minutesToTime(endMin);
        const startUtc = localDateTimeToUtcIso(current, startTime, timezone);
        const endUtc = localDateTimeToUtcIso(current, endTime, timezone);
        if (!startUtc || !endUtc) continue;

        const candidate: GeneratedSlot = {
          id: generateId(),
          start_utc: startUtc,
          end_utc: endUtc,
          sort_order: sortOrder,
        };
        if (!isValidGeneratedSlot(candidate)) continue;

        candidate.sort_order = sortOrder++;
        slots.push(candidate);
      }
    }
    current = addDays(current, 1);
  }

  return slots;
}

export function mergeExtraSlots(
  base: GeneratedSlot[],
  extras: Array<{ start_utc: string; end_utc: string }>,
  durationMinutes?: number
): GeneratedSlot[] {
  const merged = [...base];
  let sortOrder = base.length;
  for (const extra of extras) {
    const candidate: GeneratedSlot = {
      id: generateId(),
      start_utc: extra.start_utc,
      end_utc: extra.end_utc,
      sort_order: sortOrder++,
    };
    if (!isValidGeneratedSlot(candidate)) continue;
    if (
      durationMinutes !== undefined &&
      Math.abs(slotDurationMinutes(candidate.start_utc, candidate.end_utc) - durationMinutes) >=
        0.001
    ) {
      continue;
    }
    merged.push(candidate);
  }
  merged.sort((a, b) => a.start_utc.localeCompare(b.start_utc));
  return merged.map((s, i) => ({ ...s, sort_order: i }));
}
