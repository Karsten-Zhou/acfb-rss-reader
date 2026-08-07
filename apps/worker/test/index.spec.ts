import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const authEnv = {
  GITHUB_CLIENT_ID: 'client-id',
  GITHUB_CLIENT_SECRET: 'client-secret',
  AUTH_ALLOWED_GITHUB_USER_ID: '12345',
  AUTH_SESSION_SECRET: '0123456789abcdef0123456789abcdef',
  AUTH_BASE_URL: 'https://example.com',
};

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('starts github oauth and sets state cookie', async () => {
    const response = await worker.request('https://example.com/api/auth/github/start', undefined, authEnv);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('https://github.com/login/oauth/authorize');
    expect(response.headers.get('set-cookie')).toContain('rss_auth_state=');
  });

  it('returns session after successful github callback', async () => {
    const startResponse = await worker.request('https://example.com/api/auth/github/start', undefined, authEnv);
    const stateCookie = startResponse.headers.get('set-cookie')?.split(';')[0];
    const state = new URL(startResponse.headers.get('location') ?? '').searchParams.get('state');

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token-123' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 12345, login: 'me' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const callbackResponse = await worker.request(
      `https://example.com/api/auth/github/callback?code=abc&state=${encodeURIComponent(state ?? '')}`,
      {
        headers: {
          cookie: stateCookie ?? '',
        },
      },
      authEnv,
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get('set-cookie')).toContain('rss_session=');

    const sessionCookie = callbackResponse.headers.get('set-cookie')?.split(',')[0]?.split(';')[0] ?? '';

    const sessionResponse = await worker.request(
      'https://example.com/api/auth/session',
      {
        headers: {
          cookie: sessionCookie,
        },
      },
      authEnv,
    );

    await expect(sessionResponse.json()).resolves.toMatchObject({
      authenticated: true,
      githubUserId: '12345',
    });
  });

  it('rejects callback for unauthorized github account', async () => {
    const startResponse = await worker.request('https://example.com/api/auth/github/start', undefined, authEnv);
    const stateCookie = startResponse.headers.get('set-cookie')?.split(';')[0];
    const state = new URL(startResponse.headers.get('location') ?? '').searchParams.get('state');

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token-123' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 99999, login: 'other' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const callbackResponse = await worker.request(
      `https://example.com/api/auth/github/callback?code=abc&state=${encodeURIComponent(state ?? '')}`,
      {
        headers: {
          cookie: stateCookie ?? '',
        },
      },
      authEnv,
    );

    expect(callbackResponse.status).toBe(403);
  });
});
