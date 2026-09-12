/** URL-safe poll identifiers: random IDs (alphanumeric) or custom slugs (with hyphens). */
const POLL_ID_RE = /^[A-Za-z0-9-]+$/;
const MAX_POLL_ID_LENGTH = 48;

/** Custom slug format: lowercase letters, digits, hyphens; 3–48 chars. */
const CUSTOM_SLUG_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;

/** Paths and segments reserved for routing — not allowed as custom poll links. */
export const RESERVED_POLL_SLUGS = new Set([
  'api',
  'mcp',
  'p',
  'health',
  'favicon.ico',
  'robots.txt',
]);

/** Validate poll ID for safe embedding in HTML/hrefs. Returns the id or null. */
export function parsePollId(raw: string): string | null {
  if (!raw || raw.length > MAX_POLL_ID_LENGTH) return null;
  if (!POLL_ID_RE.test(raw)) return null;
  if (raw.startsWith('-') || raw.endsWith('-')) return null;
  return raw;
}

export function parseCustomSlug(
  raw: string
): { ok: true; slug: string } | { ok: false; error: string } {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return { ok: false, error: 'Custom link cannot be empty' };
  }
  if (!CUSTOM_SLUG_RE.test(normalized)) {
    return {
      ok: false,
      error:
        'Custom link must be 3–48 characters: lowercase letters, digits, and hyphens; must start with a letter or digit',
    };
  }
  if (normalized.endsWith('-')) {
    return { ok: false, error: 'Custom link cannot end with a hyphen' };
  }
  if (RESERVED_POLL_SLUGS.has(normalized)) {
    return { ok: false, error: `Custom link "${normalized}" is reserved` };
  }
  return { ok: true, slug: normalized };
}

/** Resolve optional custom poll id from create body; null means use random ID. */
export function resolveCreatePollId(body: {
  poll_id?: string;
  slug?: string;
}): { ok: true; pollId: string | null } | { ok: false; error: string } {
  const slugRaw = body.slug?.trim();
  const pollIdRaw = body.poll_id?.trim();

  if (slugRaw && pollIdRaw && slugRaw.toLowerCase() !== pollIdRaw.toLowerCase()) {
    return { ok: false, error: 'slug and poll_id must match when both are provided' };
  }

  const custom = slugRaw || pollIdRaw;
  if (!custom) return { ok: true, pollId: null };

  const parsed = parseCustomSlug(custom);
  if (!parsed.ok) return parsed;
  return { ok: true, pollId: parsed.slug };
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
