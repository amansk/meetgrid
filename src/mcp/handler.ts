import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMeetgridMcpServer } from './server';
import type { Fetcher } from './client';

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

/** Stateless Streamable HTTP MCP — new server + transport per request. */
export async function handleMcpRequest(request: Request, fetcher?: Fetcher): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: MCP_CORS });
  }

  const origin = new URL(request.url).origin;
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createMeetgridMcpServer(origin, fetcher);

  try {
    await server.connect(transport);
    return withCors(await transport.handleRequest(request));
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
}
