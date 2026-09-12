import { Hono } from 'hono';
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

export default app;
