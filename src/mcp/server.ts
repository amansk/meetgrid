import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MeetgridClient, type Fetcher } from './client';
import { resolveVoteEntries, shapePollReadResponse } from './ergonomics';
import type { PollPublicView } from '../lib/poll-view';

const explicitSlotSchema = z.object({
  date: z.string().optional().describe('Local calendar date, YYYY-MM-DD, read in the poll timezone'),
  start_time: z
    .string()
    .optional()
    .describe('Local start time, 24-hour HH:MM, read in the poll timezone'),
  duration_minutes: z
    .number()
    .int()
    .min(15)
    .max(480)
    .optional()
    .describe('Length of this slot, 15 to 480 minutes. Falls back to the poll duration_minutes.'),
  start_utc: z
    .string()
    .optional()
    .describe('ISO instant, e.g. 2026-10-02T23:00:00.000Z. Use instead of date + start_time, not as well as.'),
  end_utc: z.string().optional().describe('ISO instant ending the slot. Required alongside start_utc.'),
});

const voteEntrySchema = z.object({
  slot_id: z.string().describe('A slot id from poll_get — not an index, a label or a time'),
  yes: z.boolean().describe('true = available, false = not available'),
});

const POLL_ID_DESC =
  'The poll id, as returned by poll_create and as it appears in the poll URL (/p/<poll_id>)';

const ORGANIZER_SECRET_DESC =
  'The organizer_secret returned by poll_create. A capability token rather than a password: whoever holds it controls the poll. Never put it anywhere participants can read.';

const ALLOW_DUPLICATE_NAME_DESC =
  'Responding without an edit_token under a name already on the poll fails with code "duplicate_name", because it would count that person twice. Set true only to add a genuinely different person who happens to share the name.';

/** Stateless MCP server factory — new instance per HTTP request. */
export function createMeetgridMcpServer(apiBaseUrl: string, fetcher?: Fetcher): McpServer {
  const client = new MeetgridClient(apiBaseUrl, fetcher);

  const server = new McpServer({
    name: 'meetgrid',
    version: '1.1.0',
  });

  server.tool(
    'poll_create',
    [
      'Create a scheduling poll and get back the links to share. Nobody needs an account, to create one or to answer one.',
      '',
      'Give the times ONE of two ways:',
      '1. `slots` — an explicit list. Right for scattered dates, and the only way to have different windows on different days (6pm Friday, 10am Saturday). This is the one to reach for most of the time.',
      '2. The range generator — `start_date`, `end_date`, `daily_start`, `daily_end` and `duration_minutes` together, which fills the same daily window on every date with back-to-back slots. Only worth it when every day really does have the same window.',
      'Supplying neither fails. `slots` wins if you supply both. `title` and `timezone` are always required.',
      '',
      'Returns poll_id, poll_url (the link for participants), results_url (public), organizer_url (the admin link) and organizer_secret. Pass `email` to also email the organizer their admin link; `email_status` then says whether it went (sent, not_configured or failed), and the poll is created either way. That secret is a capability token granting full control of the poll, deletion included — keep it for the organizer calls and do not paste it into anything participants can read.',
    ].join('\n'),
    {
      title: z
        .string()
        .describe('The heading on the poll, e.g. "Forum meeting — rescheduled date"'),
      notes: z
        .string()
        .optional()
        .describe('Free text under the title, for context participants need before they answer'),
      email: z
        .string()
        .optional()
        .describe(
          "The organizer's email address. The admin link (organizer_url) is emailed there so it is not lost. Not stored, and never shown to participants."
        ),
      timezone: z
        .string()
        .describe(
          'IANA name, e.g. America/Chicago. The zone the slot times are written in, and the zone everyone sees times in by default. Not a UTC offset and not an abbreviation like CT.'
        ),
      slots: z
        .array(explicitSlotSchema)
        .optional()
        .describe(
          'The time options, in the order participants should see them. Each entry is either date + start_time (+ duration_minutes), or start_utc + end_utc.'
        ),
      duration_minutes: z
        .number()
        .int()
        .min(15)
        .max(480)
        .optional()
        .describe('Default slot length. Required for the range generator; inferred from `slots` otherwise.'),
      start_date: z.string().optional().describe('Range generator only: first date, YYYY-MM-DD'),
      end_date: z
        .string()
        .optional()
        .describe('Range generator only: last date, YYYY-MM-DD, on or after start_date'),
      daily_start: z.string().optional().describe('Range generator only: window opens at HH:MM, local'),
      daily_end: z.string().optional().describe('Range generator only: window closes at HH:MM, local'),
      weekdays: z
        .array(z.number().int().min(1).max(7))
        .optional()
        .describe(
          'Range generator only: restrict to these ISO weekdays (1=Mon … 7=Sun). Omit for every day in the range.'
        ),
      slug: z
        .string()
        .optional()
        .describe(
          'Custom URL segment, putting the poll at /p/<slug> instead of a random id, e.g. "team-sync". Lower-case letters, digits and hyphens. Fails with 409 if taken. Omit for a random id, which is also what keeps an unlisted poll hard to stumble on.'
        ),
      poll_id: z
        .string()
        .optional()
        .describe(
          'Alias of `slug`, kept for existing callers. Prefer `slug`: on every other tool `poll_id` names an existing poll, so this spelling reads as the wrong thing.'
        ),
      name: z.string().optional().describe('Alias of `slug`, kept for existing callers. Prefer `slug`.'),
    },
    async (args) => {
      const result = await client.createPoll(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'poll_get',
    [
      'Read a poll: title, notes, timezone, status (open or closed), the chosen slot if the organizer has picked one, every time slot with its id, label, yes_count and no_count, who has answered and how, and `ranked_slot_ids` ordered best first (most yes, fewest no, then earliest).',
      '',
      'Use it for any read — checking results, and getting the slot ids poll_respond needs. Safe to show anyone: it never returns the organizer secret.',
      'Fails with 404 on an unknown poll id, or one that has been deleted.',
    ].join('\n'),
    {
      poll_id: z.string().describe(POLL_ID_DESC),
    },
    async ({ poll_id }) => {
      const result = await client.getPoll(poll_id);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'read_poll',
    [
      'Alias of poll_get for clients that expect an `options` key: everything poll_get returns, plus an `options` array of { id, label, yes_count, no_count } mirroring `slots`.',
      'Prefer poll_get. Same data, same permissions, one redundant copy of the slots.',
    ].join('\n'),
    {
      poll_id: z.string().describe(POLL_ID_DESC),
    },
    async ({ poll_id }) => {
      const result = (await client.getPoll(poll_id)) as PollPublicView;
      return {
        content: [{ type: 'text', text: JSON.stringify(shapePollReadResponse(result), null, 2) }],
      };
    }
  );

  server.tool(
    'poll_respond',
    [
      'Answer a poll as one person, or change what that person already said. Call poll_get first: every vote is keyed by slot id.',
      '',
      'Answering again under a name already on the poll fails with code "duplicate_name" rather than quietly counting that person twice. Pass the edit_token to change an existing answer, or allow_duplicate_name to add a genuinely different person with the same name.',
      'A slot left out of `slot_votes` is recorded as no answer, which is not the same as a no. Send an entry for every slot you mean to answer.',
      '',
      'Returns respondent_id and edit_token. Keep the edit_token: it is the only way to change this response later and the server cannot give it back.',
      'Fails if the poll is closed.',
    ].join('\n'),
    {
      poll_id: z.string().describe(POLL_ID_DESC),
      respondent_name: z
        .string()
        .describe('Display name for this person, shown to everyone who can see the results'),
      edit_token: z
        .string()
        .optional()
        .describe(
          'The edit_token from this person’s earlier response, to change it. With a token the address is optional and the name can change freely.'
        ),
      slot_votes: z
        .array(voteEntrySchema)
        .describe('One entry per slot being answered: { slot_id, yes }. Omitted slots stay unanswered.'),
      allow_duplicate_name: z.boolean().optional().describe(ALLOW_DUPLICATE_NAME_DESC),
    },
    async ({ poll_id, respondent_name, edit_token, slot_votes, allow_duplicate_name }) => {
      const result = await client.respond(poll_id, {
        name: respondent_name,
        edit_token,
        votes: slot_votes,
        allow_duplicate_name,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'vote_poll',
    [
      'Alias of poll_respond for clients using these parameter names: `name` for the display name, and `votes` (or `options`) for the slot votes.',
      'Prefer poll_respond. Identical behaviour, identical edit_token, identical identity rules.',
    ].join('\n'),
    {
      poll_id: z.string().describe(POLL_ID_DESC),
      name: z.string().describe('Display name for this person, shown to everyone who can see the results'),
      votes: z
        .array(voteEntrySchema)
        .optional()
        .describe('The slot votes. Same thing as `options` — send one or the other, not both.'),
      options: z
        .array(voteEntrySchema)
        .optional()
        .describe('The slot votes. Same thing as `votes` — send one or the other, not both.'),
      edit_token: z
        .string()
        .optional()
        .describe('The edit_token from this person’s earlier response, to change it'),
      allow_duplicate_name: z.boolean().optional().describe(ALLOW_DUPLICATE_NAME_DESC),
    },
    async (args) => {
      const slotVotes = resolveVoteEntries(args);
      const result = await client.respond(args.poll_id, {
        name: args.name,
        edit_token: args.edit_token,
        votes: slotVotes,
        allow_duplicate_name: args.allow_duplicate_name,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'poll_set_decision',
    [
      'Mark one slot as the time that won. It shows at the top of the results page as the decision; every vote stays visible and the poll stays open to responses.',
      'Reversible — call it again with a different slot_id. Requires the organizer secret. Fails if the poll is closed.',
    ].join('\n'),
    {
      poll_id: z.string().describe(POLL_ID_DESC),
      organizer_secret: z.string().describe(ORGANIZER_SECRET_DESC),
      slot_id: z
        .string()
        .describe('The winning slot id, from poll_get. `ranked_slot_ids[0]` is the poll’s own pick.'),
    },
    async ({ poll_id, organizer_secret, slot_id }) => {
      const result = await client.setDecision(poll_id, organizer_secret, slot_id);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'poll_close',
    [
      'Stop a poll taking new or changed responses. Everything stays readable — results, votes, the decision — which makes this the safe way to finish with a poll.',
      'There is no reopen call, so it is one-way. Requires the organizer secret. Nothing deletes a poll on request: polls are removed automatically 30 days after the last thing that happens to them.',
    ].join('\n'),
    {
      poll_id: z.string().describe(POLL_ID_DESC),
      organizer_secret: z.string().describe(ORGANIZER_SECRET_DESC),
    },
    async ({ poll_id, organizer_secret }) => {
      const result = await client.closePoll(poll_id, organizer_secret);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  return server;
}
