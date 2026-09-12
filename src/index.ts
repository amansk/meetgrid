import { Hono } from 'hono';
import { sweepExpiredPolls } from './lib/expiry';
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
  /**
   * Daily retention sweep. Nothing deletes a poll on request; a poll goes 30 days
   * after the last thing that happened to it, which takes the respondents' names
   * and any stored addresses with it.
   */
  async scheduled(event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const result = await sweepExpiredPolls(env.DB, Date.now());
    if (result.deleted.length) {
      console.log(
        `retention sweep (${event.cron}): deleted ${result.deleted.length} poll(s)` +
          (result.capped ? ', hit the per-run cap, more remain' : '') +
          ' — ' +
          result.deleted.map((p) => p.id).join(', ')
      );
    }
  },

  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/mcp') {
      // Serve the MCP tools from this same isolate rather than over the network.
      return handleMcpRequest(request, (req) => app.fetch(req, env, ctx));
    }
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
