/** Convert a local date+time in a timezone to UTC ISO string. */
export function localDateTimeToUtcIso(
  dateStr: string,
  timeStr: string,
  timeZone: string
): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  let guess = Date.UTC(year, month - 1, day, hour, minute);

  for (let i = 0; i < 6; i++) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const targetMs = Date.UTC(year, month - 1, day, hour, minute);
    const actualMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const delta = targetMs - actualMs;
    if (delta === 0) break;
    guess += delta;
  }

  return new Date(guess).toISOString();
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour,
    minute: Number(get('minute')),
  };
}

/** Format UTC ISO string for display in poll timezone. */
export function formatSlotLabel(startUtc: string, endUtc: string, timeZone: string): string {
  const start = new Date(startUtc);
  const end = new Date(endUtc);

  const dateFmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const datePart = dateFmt.format(start);
  const startTime = timeFmt.format(start);
  const endTime = timeFmt.format(end);
  return `${datePart} · ${startTime} – ${endTime}`;
}

/** ISO weekday 1=Mon … 7=Sun for a YYYY-MM-DD date in timezone. */
export function isoWeekdayInTimezone(dateStr: string, timeZone: string): number {
  const utc = localDateTimeToUtcIso(dateStr, '12:00', timeZone);
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
  const day = formatter.format(new Date(utc));
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[day] ?? 1;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
