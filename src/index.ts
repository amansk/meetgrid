import { Hono } from 'hono';
import { handleMcpRequest } from './mcp/handler';
import api from './routes/api';
import pages from './routes/pages';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.route('/api', api);
app.route('/', pages);

app.notFound((c) => {
  return c.text('Not found', 404);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/mcp') {
      return handleMcpRequest(request);
    }
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
