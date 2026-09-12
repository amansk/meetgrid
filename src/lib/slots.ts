import { generateId } from './crypto';
import {
  addDays,
  isoWeekdayInTimezone,
  localDateTimeToUtcIso,
  minutesToTime,
  parseTimeToMinutes,
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
        slots.push({
          id: generateId(),
          start_utc: localDateTimeToUtcIso(current, startTime, timezone),
          end_utc: localDateTimeToUtcIso(current, endTime, timezone),
          sort_order: sortOrder++,
        });
      }
    }
    current = addDays(current, 1);
  }

  return slots;
}

export function mergeExtraSlots(
  base: GeneratedSlot[],
  extras: Array<{ start_utc: string; end_utc: string }>
): GeneratedSlot[] {
  const merged = [...base];
  let sortOrder = base.length;
  for (const extra of extras) {
    merged.push({
      id: generateId(),
      start_utc: extra.start_utc,
      end_utc: extra.end_utc,
      sort_order: sortOrder++,
    });
  }
  merged.sort((a, b) => a.start_utc.localeCompare(b.start_utc));
  return merged.map((s, i) => ({ ...s, sort_order: i }));
}
