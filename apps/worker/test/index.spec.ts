import { describe, expect, it } from 'vitest';
import worker from '../src/index';

describe('worker routes', () => {
  it('returns health payload', async () => {
    const response = await worker.request('https://example.com/api/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'worker',
    });
  });

  it('detects steam compatibility by URL', async () => {
    const response = await worker.request(
      'https://example.com/api/compatibility?url=https://steamcommunity.com/news',
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { modules: { id: string }[] };
    expect(payload.modules.some((module) => module.id === 'steam')).toBe(true);
  });

  it('rejects invalid compatibility URL input', async () => {
    const response = await worker.request('https://example.com/api/compatibility?url=not-a-url');

    expect(response.status).toBe(400);
  });
});
