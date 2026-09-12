import { formatSlotLabel } from './timezone';
import type { PollRow, RespondentRow, SlotRow, VoteRow } from '../types';

export interface PublicSlot {
  id: string;
  start_utc: string;
  end_utc: string;
  label: string;
  yes_count: number;
  no_count: number;
  sort_order: number;
}

export interface PublicResponse {
  id: string;
  name: string;
  votes: Record<string, boolean>;
}

export interface PollPublicView {
  id: string;
  title: string;
  notes: string | null;
  timezone: string;
  duration_minutes: number;
  status: string;
  chosen_slot_id: string | null;
  slots: PublicSlot[];
  responses: PublicResponse[];
  ranked_slot_ids: string[];
}

export function buildPollView(
  poll: PollRow,
  slots: SlotRow[],
  respondents: RespondentRow[],
  votes: VoteRow[]
): PollPublicView {
  const yesBySlot = new Map<string, number>();
  const noBySlot = new Map<string, number>();
  for (const slot of slots) {
    yesBySlot.set(slot.id, 0);
    noBySlot.set(slot.id, 0);
  }
  for (const vote of votes) {
    if (vote.yes) {
      yesBySlot.set(vote.slot_id, (yesBySlot.get(vote.slot_id) ?? 0) + 1);
    } else {
      noBySlot.set(vote.slot_id, (noBySlot.get(vote.slot_id) ?? 0) + 1);
    }
  }

  const publicSlots: PublicSlot[] = slots.map((s) => ({
    id: s.id,
    start_utc: s.start_utc,
    end_utc: s.end_utc,
    label: formatSlotLabel(s.start_utc, s.end_utc, poll.timezone),
    yes_count: yesBySlot.get(s.id) ?? 0,
    no_count: noBySlot.get(s.id) ?? 0,
    sort_order: s.sort_order,
  }));

  const ranked = [...publicSlots]
    .sort((a, b) => b.yes_count - a.yes_count || a.start_utc.localeCompare(b.start_utc))
    .map((s) => s.id);

  const votesByRespondent = new Map<string, Record<string, boolean>>();
  for (const vote of votes) {
    if (!votesByRespondent.has(vote.respondent_id)) {
      votesByRespondent.set(vote.respondent_id, {});
    }
    votesByRespondent.get(vote.respondent_id)![vote.slot_id] = vote.yes === 1;
  }

  const responses: PublicResponse[] = respondents.map((r) => ({
    id: r.id,
    name: r.name,
    votes: votesByRespondent.get(r.id) ?? {},
  }));

  return {
    id: poll.id,
    title: poll.title,
    notes: poll.notes,
    timezone: poll.timezone,
    duration_minutes: poll.duration_minutes,
    status: poll.status,
    chosen_slot_id: poll.chosen_slot_id,
    slots: publicSlots,
    responses,
    ranked_slot_ids: ranked,
  };
}
