/** Convert UTC ISO-8601 to iCalendar / Google Calendar compact form (YYYYMMDDTHHMMSSZ). */
export function utcToIcsDate(iso: string): string {
  const normalized = String(iso).trim();
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid UTC timestamp: ${iso}`);
  }
  return parsed
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** RFC 5545 text escaping for SUMMARY, DESCRIPTION, etc. */
export function escapeIcs(text: string): string {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n');
}

export interface GoogleCalendarUrlOptions {
  title: string;
  startUtc: string;
  endUtc: string;
  details?: string;
  /** Ignored when dates use a Z suffix (UTC). ctz is only valid with floating local times. */
  ctz?: string;
}

/**
 * Build a Google Calendar “template” URL for an absolute UTC instant.
 *
 * Google Calendar URL semantics (see add-event-to-calendar-docs / Google help):
 * - `dates=YYYYMMDDTHHMMSSZ/…Z` — absolute UTC; Google displays in the viewer’s calendar TZ.
 * - `dates=YYYYMMDDTHHMMSS/…` + `ctz=Area/City` — floating wall time in the named zone.
 *
 * Meetgrid slots are stored as UTC ISO (`start_utc` / `end_utc`). We use the **Z form
 * without `ctz`**, matching ICS (DTSTART/DTEND Z). Production smoke (post-#5) showed the
 * broken shape `dates=…Z&ctz=America/Los_Angeles`, which can mis-shift the event.
 *
 * Alternative (not used): convert UTC → poll-local floating times and pass `ctz=poll.timezone`.
 * That preserves wall-clock in the poll zone but adds DST conversion complexity; Z-only is
 * unambiguous for a single global instant.
 */
export function googleCalendarUrl(opts: GoogleCalendarUrlOptions): string {
  const start = utcToIcsDate(opts.startUtc);
  const end = utcToIcsDate(opts.endUtc);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: opts.title,
    dates: `${start}/${end}`,
    details: opts.details || '',
  });
  const usesUtcSuffix = start.endsWith('Z') && end.endsWith('Z');
  if (opts.ctz && !usesUtcSuffix) {
    params.set('ctz', opts.ctz);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export interface BuildIcsOptions {
  title: string;
  startUtc: string;
  endUtc: string;
  description?: string;
  url?: string;
  uid?: string;
}

export function buildIcs(opts: BuildIcsOptions): string {
  const uid = opts.uid || `meetgrid-${opts.startUtc}@meetgrid.app`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Meetgrid//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcToIcsDate(new Date().toISOString())}`,
    `DTSTART:${utcToIcsDate(opts.startUtc)}`,
    `DTEND:${utcToIcsDate(opts.endUtc)}`,
    `SUMMARY:${escapeIcs(opts.title)}`,
    opts.description ? `DESCRIPTION:${escapeIcs(opts.description)}` : null,
    opts.url ? `URL:${escapeIcs(opts.url)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

/** Safe filename stem from poll title for .ics downloads. */
export function icsFilenameStem(title: string): string {
  return String(title).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'event';
}
