import type { PollPublicView } from '../lib/poll-view';

export interface PollOption {
  id: string;
  label: string;
  yes_count: number;
  no_count: number;
}

export interface PollReadShape extends PollPublicView {
  /** Agent-friendly view of slots for voting — same data as `slots`, keyed for MCP ergonomics. */
  options: PollOption[];
}

/** Map poll_get payload to include an `options` list for voting agents. Keeps `slots` unchanged. */
export function shapePollReadResponse(poll: PollPublicView): PollReadShape {
  return {
    ...poll,
    options: poll.slots.map((s) => ({
      id: s.id,
      label: s.label,
      yes_count: s.yes_count,
      no_count: s.no_count,
    })),
  };
}

export interface VoteEntry {
  slot_id: string;
  yes: boolean;
}

export function resolveVoteEntries(args: {
  votes?: VoteEntry[];
  options?: VoteEntry[];
}): VoteEntry[] {
  const entries = args.votes ?? args.options;
  if (!entries?.length) {
    throw new Error('votes or options is required (non-empty array of { slot_id, yes })');
  }
  return entries;
}
