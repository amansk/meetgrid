const POLL_ID_RE = /^[A-Za-z0-9]+$/;

/** Validate poll ID for safe embedding in HTML/hrefs. Returns the id or null. */
export function parsePollId(raw: string): string | null {
  if (!POLL_ID_RE.test(raw)) return null;
  return raw;
}

/** Inclusive day count between YYYY-MM-DD dates. */
export function daysBetween(startDate: string, endDate: string): number {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  return Math.floor((endMs - startMs) / 86400000) + 1;
}

export const MAX_POLL_DAYS = 60;
export const MAX_SLOTS = 500;
