export interface Env {
  DB: D1Database;
  RATE_LIMIT_WINDOW_SECONDS?: string;
  RATE_LIMIT_MAX_WRITES?: string;
}

export type PollStatus = 'open' | 'closed';

export interface PollRow {
  id: string;
  title: string;
  notes: string | null;
  timezone: string;
  duration_minutes: number;
  organizer_secret_hash: string;
  status: PollStatus;
  chosen_slot_id: string | null;
  created_at: number;
}

export interface SlotRow {
  id: string;
  poll_id: string;
  start_utc: string;
  end_utc: string;
  sort_order: number;
}

export interface RespondentRow {
  id: string;
  poll_id: string;
  name: string;
  edit_token_hash: string;
  created_at: number;
  updated_at: number;
}

export interface VoteRow {
  respondent_id: string;
  slot_id: string;
  yes: number;
}

export interface ExplicitSlotInput {
  date?: string;
  start_time?: string;
  duration_minutes?: number;
  start_utc?: string;
  end_utc?: string;
}

export interface CreatePollBody {
  title: string;
  notes?: string;
  /** Optional custom poll URL segment (aliases: slug, name). Random ID when omitted. */
  poll_id?: string;
  slug?: string;
  name?: string;
  timezone: string;
  /** Explicit slots — preferred over range generation when provided. */
  slots?: ExplicitSlotInput[];
  /** Default poll duration metadata; inferred from slots when omitted. */
  duration_minutes?: number;
  /** Range generator (optional when slots provided). */
  start_date?: string;
  end_date?: string;
  daily_start?: string;
  daily_end?: string;
  weekdays?: number[];
}

export interface RespondBody {
  name: string;
  edit_token?: string;
  votes: Array<{ slot_id: string; yes: boolean }>;
}
