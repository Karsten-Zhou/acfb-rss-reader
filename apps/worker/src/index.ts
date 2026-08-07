import { Hono } from 'hono';
import { z } from 'zod';
import { detectCompatibilityModules } from '../../../packages/compatibility/src/index';

const app = new Hono();

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', service: 'worker' });
});

const compatibilityQuerySchema = z.object({
  url: z.string().url(),
});

app.get('/api/compatibility', (c) => {
  const parsed = compatibilityQuerySchema.safeParse({
    url: c.req.query('url'),
  });

  if (!parsed.success) {
    return c.json({ error: 'Invalid URL query parameter' }, 400);
  }

  const url = new URL(parsed.data.url);
  const modules = detectCompatibilityModules(url).map((module) => ({
    id: module.id,
    css: module.css,
  }));

  return c.json({ modules });
});

app.get('*', (c) => {
  return c.text('Cloudflare RSS Reader Worker');
});

export default app;
