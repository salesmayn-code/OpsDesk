import type { ApiError } from '@opsdesk/contracts';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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

async function request(path: string, options: RequestInit): Promise<Response> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  return fetch(`${API_URL}/api/v1${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers ?? {}),
    },
  });
}

async function refreshSession(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetch wrapper: cookie auth, refresh-on-401 (single-flight), normalized errors. */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response = await request(path, options);

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
