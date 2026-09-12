import { generateId } from './crypto';
import type { GeneratedSlot } from './slots';
import { localDateTimeToUtcIso, slotDurationMinutes } from './timezone';

export interface ExplicitSlotInput {
  date?: string;
  start_time?: string;
  duration_minutes?: number;
  start_utc?: string;
  end_utc?: string;
}

export interface LocalSlotPreview {
  date: string;
  start_time: string;
  duration_minutes: number;
}

const MIN_DURATION = 15;

function isValidSlot(startUtc: string, endUtc: string, expectedMinutes: number): boolean {
  if (startUtc >= endUtc) return false;
  const actual = slotDurationMinutes(startUtc, endUtc);
  return Math.abs(actual - expectedMinutes) < 0.001;
}

export function buildExplicitSlots(
  inputs: ExplicitSlotInput[],
  timezone: string
): GeneratedSlot[] {
  if (!inputs.length) {
    throw new Error('At least one slot is required');
  }

  const slots: GeneratedSlot[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    let startUtc: string;
    let endUtc: string;
    let durationMinutes: number;

    if (input.start_utc && input.end_utc) {
      startUtc = input.start_utc;
      endUtc = input.end_utc;
      durationMinutes = slotDurationMinutes(startUtc, endUtc);
    } else if (input.date && input.start_time && input.duration_minutes != null) {
      durationMinutes = input.duration_minutes;
      if (durationMinutes < MIN_DURATION) {
        throw new Error(`Slot ${i + 1}: duration must be at least ${MIN_DURATION} minutes`);
      }
      const startLocal = localDateTimeToUtcIso(input.date, input.start_time, timezone);
      if (!startLocal) {
        throw new Error(`Slot ${i + 1}: time does not exist in ${timezone} (DST gap)`);
      }
      startUtc = startLocal;
      endUtc = new Date(new Date(startUtc).getTime() + durationMinutes * 60_000).toISOString();
    } else {
      throw new Error(
        `Slot ${i + 1}: provide date, start_time, duration_minutes — or start_utc and end_utc`
      );
    }

    if (durationMinutes < MIN_DURATION) {
      throw new Error(`Slot ${i + 1}: duration must be at least ${MIN_DURATION} minutes`);
    }
    if (!isValidSlot(startUtc, endUtc, durationMinutes)) {
      throw new Error(`Slot ${i + 1}: invalid slot times`);
    }

    slots.push({
      id: generateId(),
      start_utc: startUtc,
      end_utc: endUtc,
      sort_order: i,
    });
  }

  return slots;
}

/** Derive poll default duration from explicit slots (first slot, or minimum). */
export function defaultPollDuration(inputs: ExplicitSlotInput[]): number {
  for (const s of inputs) {
    if (s.duration_minutes != null && s.duration_minutes >= MIN_DURATION) {
      return s.duration_minutes;
    }
    if (s.start_utc && s.end_utc) {
      const d = slotDurationMinutes(s.start_utc, s.end_utc);
      if (d >= MIN_DURATION) return Math.round(d);
    }
  }
  return 30;
}

export function generatedSlotsToLocal(
  slots: GeneratedSlot[],
  timezone: string
): LocalSlotPreview[] {
  return slots.map((s) => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date(s.start_utc));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    let hour = get('hour');
    if (hour === '24') hour = '00';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    const start_time = `${hour}:${get('minute')}`;
    const duration_minutes = Math.round(slotDurationMinutes(s.start_utc, s.end_utc));
    return { date, start_time, duration_minutes };
  });
}
