import { z } from 'zod';

const authEnvSchema = z.object({
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  AUTH_ALLOWED_GITHUB_USER_ID: z.string().min(1),
  AUTH_SESSION_SECRET: z.string().min(16),
  AUTH_BASE_URL: z.string().url().optional(),
});

export type AuthConfig = z.infer<typeof authEnvSchema>;

export type SessionPayload = {
  githubUserId: string;
  githubLogin: string;
  expiresAt: number;
};

const encoder = new TextEncoder();

const encodeBase64Url = (input: Uint8Array): string => {
  const base64 = btoa(String.fromCharCode(...input));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const decodeBase64Url = (input: string): Uint8Array => {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const createHmacKey = async (secret: string): Promise<CryptoKey> => {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
};

export const createSignedToken = async <T extends object>(payload: T, secret: string): Promise<string> => {
  const data = encoder.encode(JSON.stringify(payload));
  const key = await createHmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
  return `${encodeBase64Url(data)}.${encodeBase64Url(signature)}`;
};

export const verifySignedToken = async <T extends object>(token: string, secret: string): Promise<T | null> => {
  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) {
    return null;
  }

  const payloadBytes = decodeBase64Url(payloadPart);
  const signatureBytes = decodeBase64Url(signaturePart);
  const key = await createHmacKey(secret);
  const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, payloadBytes);

  if (!isValid) {
    return null;
  }

  try {
    return JSON.parse(new TextDecoder().decode(payloadBytes)) as T;
  } catch {
    return null;
  }
};

export const readAuthConfig = (env: Record<string, unknown>): AuthConfig | null => {
  const parsed = authEnvSchema.safeParse(env);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

export const getSessionExpiry = (): number => Date.now() + 1000 * 60 * 60 * 24 * 14;

export const isSessionValid = (session: SessionPayload): boolean => {
  return session.expiresAt > Date.now() && session.githubUserId.length > 0;
};
