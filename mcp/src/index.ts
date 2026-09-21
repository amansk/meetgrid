#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MeetgridClient } from './client.js';
import { resolveVoteEntries, shapePollReadResponse } from './ergonomics.js';

const MEETGRID_API_URL = process.env.MEETGRID_API_URL ?? 'http://127.0.0.1:8787';

const client = new MeetgridClient(MEETGRID_API_URL);

const explicitSlotSchema = z.object({
  date: z.string().optional().describe('Local date YYYY-MM-DD in poll timezone'),
  start_time: z.string().optional().describe('Local start time HH:MM'),
  duration_minutes: z.number().int().min(15).max(480).optional().describe('Slot length in minutes'),
  start_utc: z.string().optional().describe('UTC ISO start (alternative to date+start_time+duration)'),
  end_utc: z.string().optional().describe('UTC ISO end (alternative to date+start_time+duration)'),
});

const voteEntrySchema = z.object({
  slot_id: z.string(),
  yes: z.boolean(),
});

const server = new McpServer({
  name: 'meetgrid',
  version: '1.0.0',
});

server.tool(
  'poll_create',
  'Create a Meetgrid poll. Prefer explicit slots array; range fields are optional fallback for grid generation. Returns organizer_url (the admin link); pass email to also email it to the organizer.',
  {
    title: z.string().describe('Poll title'),
    notes: z.string().optional().describe('Optional notes for respondents'),
    email: z
      .string()
      .optional()
      .describe("Organizer's email; the admin link is emailed there. Not stored."),
    timezone: z.string().describe('IANA timezone, e.g. America/Los_Angeles'),
    slots: z
      .array(explicitSlotSchema)
      .optional()
      .describe('Explicit time options (preferred). Each slot: date+start_time+duration_minutes or start_utc+end_utc.'),
    duration_minutes: z
      .number()
      .int()
      .min(15)
      .max(480)
      .optional()
      .describe('Default duration metadata; required for range generation, inferred from slots otherwise'),
    start_date: z.string().optional().describe('Range generator: first date YYYY-MM-DD'),
    end_date: z.string().optional().describe('Range generator: last date YYYY-MM-DD'),
    daily_start: z.string().optional().describe('Range generator: daily window start HH:MM'),
    daily_end: z.string().optional().describe('Range generator: daily window end HH:MM'),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .optional()
      .describe('Range generator: ISO weekdays (1=Mon … 7=Sun). Omit for all days.'),
    slug: z
      .string()
      .optional()
      .describe('Optional custom poll URL segment (e.g. team-sync → /p/team-sync). Random ID when omitted.'),
    poll_id: z
      .string()
      .optional()
      .describe('Alias for slug — same validation and behavior.'),
    name: z
      .string()
      .optional()
      .describe('Optional custom poll link name/slug (e.g. team-sync → /p/team-sync). Alias of slug.'),
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
  'Get public poll details, slots, responses, and ranked results. Never returns organizer_secret.',
  {
    poll_id: z.string().describe('Public poll ID'),
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
  'Read a poll and its options for voting. Same data as poll_get, with an `options` list (id, label, yes_count, no_count) for each time slot.',
  {
    poll_id: z.string().describe('Public poll ID'),
  },
  async ({ poll_id }) => {
    const result = await client.getPoll(poll_id) as {
      slots: Array<{ id: string; label: string; yes_count: number; no_count: number }>;
      [key: string]: unknown;
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(shapePollReadResponse(result), null, 2) }],
    };
  }
);

server.tool(
  'poll_respond',
  'Submit or update availability for a poll. Returns an edit_token for future changes.',
  {
    poll_id: z.string().describe('Public poll ID'),
    respondent_name: z.string().describe('Display name for the respondent'),
    edit_token: z.string().optional().describe('Existing edit token to update a prior response'),
    slot_votes: z
      .array(
        z.object({
          slot_id: z.string(),
          yes: z.boolean(),
        })
      )
      .describe('Yes/no votes per slot'),
  },
  async ({ poll_id, respondent_name, edit_token, slot_votes }) => {
    const result = await client.respond(poll_id, {
      name: respondent_name,
      edit_token,
      votes: slot_votes,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'vote_poll',
  'Vote yes/no on poll options. Call read_poll first to get slot ids.',
  {
    poll_id: z.string().describe('Public poll ID'),
    name: z.string().describe('Voter display name'),
    votes: z
      .array(voteEntrySchema)
      .optional()
      .describe('Yes/no votes per slot (alias: options)'),
    options: z
      .array(voteEntrySchema)
      .optional()
      .describe('Yes/no votes per slot (alias: votes)'),
    edit_token: z.string().optional().describe('Existing edit token to update a prior response'),
  },
  async (args) => {
    const slotVotes = resolveVoteEntries(args);
    const result = await client.respond(args.poll_id, {
      name: args.name,
      edit_token: args.edit_token,
      votes: slotVotes,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'poll_set_decision',
  'Organizer marks the chosen final time slot.',
  {
    poll_id: z.string().describe('Public poll ID'),
    organizer_secret: z.string().describe('Organizer capability token from poll creation'),
    slot_id: z.string().describe('Chosen slot ID'),
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
  'Organizer closes the poll — no further responses accepted.',
  {
    poll_id: z.string().describe('Public poll ID'),
    organizer_secret: z.string().describe('Organizer capability token from poll creation'),
  },
  async ({ poll_id, organizer_secret }) => {
    const result = await client.closePoll(poll_id, organizer_secret);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Meetgrid MCP server connected (API: ${MEETGRID_API_URL})`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
