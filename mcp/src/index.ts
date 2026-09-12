#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MeetgridClient } from './client.js';

const MEETGRID_API_URL = process.env.MEETGRID_API_URL ?? 'http://127.0.0.1:8787';

const client = new MeetgridClient(MEETGRID_API_URL);

const server = new McpServer({
  name: 'meetgrid',
  version: '1.0.0',
});

server.tool(
  'poll_create',
  'Create a new Meetgrid scheduling poll with auto-generated time slots.',
  {
    title: z.string().describe('Poll title'),
    notes: z.string().optional().describe('Optional notes for respondents'),
    timezone: z.string().describe('IANA timezone, e.g. America/Los_Angeles'),
    duration_minutes: z.number().int().min(15).max(480).describe('Meeting duration in minutes'),
    start_date: z.string().describe('First date YYYY-MM-DD'),
    end_date: z.string().describe('Last date YYYY-MM-DD'),
    daily_start: z.string().describe('Daily window start HH:MM'),
    daily_end: z.string().describe('Daily window end HH:MM'),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .optional()
      .describe('ISO weekdays to include (1=Mon … 7=Sun). Omit for all days.'),
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
