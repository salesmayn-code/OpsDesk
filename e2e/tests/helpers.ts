import type { APIRequestContext, APIResponse, BrowserContext } from '@playwright/test';

export const API_URL = 'http://localhost:4000';
export const WEB_URL = 'http://localhost:3000';
export const PASSWORD = 'ChangeMe!12345';

interface CookiePair {
  name: string;
  value: string;
  path: string;
}

/**
 * Sessions are cached per user: the suite logs in from several browser contexts
 * and login is rate-limited to 5/min/IP+email by design.
 */
const sessionCache = new Map<string, CookiePair[]>();

function parseSetCookies(response: APIResponse): CookiePair[] {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => {
      const [pair, ...attrs] = header.value.split('; ');
      const [name, ...valueParts] = pair!.split('=');
      const path = attrs.find((attr) => attr.toLowerCase().startsWith('path=')) ?? 'path=/';
      return { name: name!, value: valueParts.join('='), path: path.slice(5) };
    });
}

export async function apiLogin(request: APIRequestContext, email: string): Promise<CookiePair[]> {
  const cached = sessionCache.get(email);
  if (cached) return cached;

  const response = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email, password: PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(`Login failed for ${email}: ${response.status()} ${await response.text()}`);
  }
  const cookies = parseSetCookies(response);
  sessionCache.set(email, cookies);
  return cookies;
}

/** Drops a cached session so a test can exercise the real login endpoint again. */
export function forgetSession(email: string): void {
  sessionCache.delete(email);
}

/** Logs a browser context in via the real API and installs the session cookies. */
export async function loginAs(context: BrowserContext, email: string): Promise<void> {
  const cookies = await apiLogin(context.request, email);
  await context.addCookies(
    cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: 'localhost',
      path: cookie.path,
    })),
  );
}

export function unique(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}`;
}

export const users = {
  employee: 'employee@opsdesk.local',
  agent: 'agent@opsdesk.local',
  manager: 'manager@opsdesk.local',
  admin: 'admin@opsdesk.local',
};

/** Reads the latest Mailpit message for a recipient and extracts the invite token. */
export async function fetchInviteToken(
  request: APIRequestContext,
  email: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await request.get('http://localhost:8025/api/v1/messages?limit=50');
    const body = (await list.json()) as { messages?: { ID: string; To?: { Address: string }[] }[] };
    const match = body.messages?.find((message) =>
      message.To?.some((to) => to.Address.toLowerCase() === email.toLowerCase()),
    );
    if (match) {
      const detail = await request.get(`http://localhost:8025/api/v1/message/${match.ID}`);
      const content = (await detail.json()) as { HTML?: string; Text?: string };
      const raw = `${content.HTML ?? ''}\n${content.Text ?? ''}`;
      const token = raw.match(/accept-invite\?token=([A-Za-z0-9_-]+)/)?.[1];
      if (token) return token;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No invitation email found for ${email}`);
}
