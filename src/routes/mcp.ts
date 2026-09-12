import { Hono } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMeetgridMcpServer } from '../mcp/server';
import type { Env } from '../types';

const mcp = new Hono<{ Bindings: Env }>();

const MCP_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, mcp-session-id, Last-Event-ID, mcp-protocol-version',
  'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(MCP_CORS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

mcp.options('/mcp', () => new Response(null, { status: 204, headers: MCP_CORS }));

mcp.all('/mcp', async (c) => {
  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: MCP_CORS });
  }

  const origin = new URL(c.req.url).origin;
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createMeetgridMcpServer(origin);

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(c.req.raw);
    return withCors(response);
  } catch (err) {
    console.error('MCP request failed:', err);
    return withCors(
      Response.json(
        {
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        },
        { status: 500 }
      )
    );
  }
});

export default mcp;
