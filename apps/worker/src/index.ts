import { getCookie, deleteCookie, setCookie } from 'hono/cookie';
import { Hono } from 'hono';
import { z } from 'zod';
import { detectCompatibilityModules } from '../../../packages/compatibility/src/index';
import {
  createSignedToken,
  getSessionExpiry,
  isSessionValid,
  readAuthConfig,
  verifySignedToken,
  type SessionPayload,
} from './auth';

type WorkerBindings = {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  AUTH_ALLOWED_GITHUB_USER_ID?: string;
  AUTH_SESSION_SECRET?: string;
  AUTH_BASE_URL?: string;
};

const app = new Hono<{ Bindings: WorkerBindings }>();

const compatibilityQuerySchema = z.object({
  url: z.string().url(),
});

const authCallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

const sessionCookieName = 'rss_session';
const stateCookieName = 'rss_auth_state';

const cookieOptions = {
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'Lax' as const,
};

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', service: 'worker' });
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

app.get('/api/auth/github/start', async (c) => {
  const authConfig = readAuthConfig(c.env);
  if (!authConfig) {
    return c.json({ error: 'Auth is not configured' }, 500);
  }

  const stateToken = await createSignedToken(
    {
      nonce: crypto.randomUUID(),
      issuedAt: Date.now(),
    },
    authConfig.AUTH_SESSION_SECRET,
  );

  setCookie(c, stateCookieName, stateToken, {
    ...cookieOptions,
    maxAge: 60 * 10,
  });

  const baseUrl = authConfig.AUTH_BASE_URL ?? new URL(c.req.url).origin;
  const redirectUri = `${baseUrl}/api/auth/github/callback`;
  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.set('client_id', authConfig.GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set('redirect_uri', redirectUri);
  githubAuthUrl.searchParams.set('scope', 'read:user');
  githubAuthUrl.searchParams.set('state', stateToken);

  return c.redirect(githubAuthUrl.toString(), 302);
});

app.get('/api/auth/github/callback', async (c) => {
  const authConfig = readAuthConfig(c.env);
  if (!authConfig) {
    return c.json({ error: 'Auth is not configured' }, 500);
  }

  const queryParsed = authCallbackQuerySchema.safeParse({
    code: c.req.query('code'),
    state: c.req.query('state'),
  });

  if (!queryParsed.success) {
    return c.json({ error: 'Invalid OAuth callback query' }, 400);
  }

  const stateCookie = getCookie(c, stateCookieName);
  if (!stateCookie || stateCookie !== queryParsed.data.state) {
    return c.json({ error: 'Invalid OAuth state' }, 400);
  }

  const verifiedState = await verifySignedToken<{ nonce: string; issuedAt: number }>(
    stateCookie,
    authConfig.AUTH_SESSION_SECRET,
  );
  if (!verifiedState) {
    return c.json({ error: 'Invalid OAuth state' }, 400);
  }

  const baseUrl = authConfig.AUTH_BASE_URL ?? new URL(c.req.url).origin;
  const redirectUri = `${baseUrl}/api/auth/github/callback`;

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: authConfig.GITHUB_CLIENT_ID,
      client_secret: authConfig.GITHUB_CLIENT_SECRET,
      code: queryParsed.data.code,
      redirect_uri: redirectUri,
      state: queryParsed.data.state,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    return c.json({ error: 'GitHub token exchange failed' }, 502);
  }

  const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenPayload.access_token) {
    return c.json({ error: 'GitHub token exchange failed' }, 502);
  }

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: 'Bearer ' + tokenPayload.access_token,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'cloudflare-based-rss-reader',
    },
  });

  if (!userResponse.ok) {
    return c.json({ error: 'Failed to fetch GitHub user' }, 502);
  }

  const userPayload = (await userResponse.json()) as { id?: number; login?: string };
  const githubUserId = userPayload.id ? String(userPayload.id) : '';
  const githubLogin = userPayload.login ?? '';

  if (!githubUserId || githubUserId !== authConfig.AUTH_ALLOWED_GITHUB_USER_ID) {
    return c.json({ error: 'Unauthorized GitHub account' }, 403);
  }

  const sessionPayload: SessionPayload = {
    githubUserId,
    githubLogin,
    expiresAt: getSessionExpiry(),
  };

  const sessionToken = await createSignedToken(sessionPayload, authConfig.AUTH_SESSION_SECRET);

  setCookie(c, sessionCookieName, sessionToken, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 14,
  });
  deleteCookie(c, stateCookieName, cookieOptions);

  return c.redirect('/', 302);
});

app.get('/api/auth/session', async (c) => {
  const authConfig = readAuthConfig(c.env);
  if (!authConfig) {
    return c.json({ authenticated: false });
  }

  const sessionCookie = getCookie(c, sessionCookieName);
  if (!sessionCookie) {
    return c.json({ authenticated: false });
  }

  const session = await verifySignedToken<SessionPayload>(sessionCookie, authConfig.AUTH_SESSION_SECRET);
  if (!session || !isSessionValid(session)) {
    return c.json({ authenticated: false });
  }

  return c.json({
    authenticated: true,
    githubUserId: session.githubUserId,
    githubLogin: session.githubLogin,
  });
});

app.post('/api/auth/logout', (c) => {
  deleteCookie(c, sessionCookieName, cookieOptions);
  return c.json({ success: true });
});

app.get('*', (c) => {
  return c.text('Cloudflare RSS Reader Worker');
});

export default app;
