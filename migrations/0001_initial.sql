-- Meetgrid initial schema

CREATE TABLE polls (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  timezone TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  organizer_secret_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  chosen_slot_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE slots (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  start_utc TEXT NOT NULL,
  end_utc TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE INDEX idx_slots_poll ON slots(poll_id, sort_order);

CREATE TABLE respondents (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  edit_token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_respondents_poll ON respondents(poll_id);

CREATE TABLE votes (
  respondent_id TEXT NOT NULL REFERENCES respondents(id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  yes INTEGER NOT NULL CHECK (yes IN (0, 1)),
  PRIMARY KEY (respondent_id, slot_id)
);

CREATE INDEX idx_votes_slot ON votes(slot_id);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
