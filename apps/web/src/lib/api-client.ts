import type { ApiError } from '@opsdesk/contracts';

/** Empty = same origin; next.config.ts proxies /api/v1 to API_ORIGIN. */
export const API_URL = '';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly details?: { field: string; issue: string }[],
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

let refreshPromise: Promise<boolean> | null = null;

/** Double-submit CSRF token (TRD §12): the API sets a readable cookie, we echo it as a header. */
function csrfHeader(method: string | undefined): Record<string, string> {
  if (!method || ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return {};
  if (typeof document === 'undefined') return {};
  const token = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('opsdesk_csrf='))
    ?.slice('opsdesk_csrf='.length);
  return token ? { 'X-CSRF-Token': decodeURIComponent(token) } : {};
}

async function request(path: string, options: RequestInit): Promise<Response> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  return fetch(`${API_URL}/api/v1${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...csrfHeader(options.method),
      ...(options.headers ?? {}),
    },
  });
}

async function refreshSession(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: csrfHeader('POST'),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetch wrapper: cookie auth, refresh-on-401 (single-flight), normalized errors. */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response = await request(path, options);

  // First mutation in a fresh tab may predate the CSRF cookie; the 403 response sets it.
  if (response.status === 403) {
    const body = (await response.clone().json().catch(() => null)) as ApiError | null;
    if (body?.code === 'CSRF_INVALID') response = await request(path, options);
  }

  if (response.status === 401 && path !== '/auth/refresh' && path !== '/auth/login') {
    refreshPromise ??= refreshSession().finally(() => {
      refreshPromise = null;
    });
    if (await refreshPromise) {
      response = await request(path, options);
    }
  }

  if (!response.ok) {
    let body: ApiError | undefined;
    try {
      body = (await response.json()) as ApiError;
    } catch {
      // non-JSON error body
    }
    throw new ApiClientError(
      response.status,
      body?.code ?? 'INTERNAL_ERROR',
      body?.message ?? 'Something went wrong. Please try again.',
      body?.requestId,
      body?.details,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
