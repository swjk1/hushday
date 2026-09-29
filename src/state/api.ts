import { getState } from './store';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Status 0 means the network or the API itself is unreachable. */
export const isOffline = (error: unknown) => error instanceof ApiError && (error.status === 0 || error.status === 503 || error.status >= 502);

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getState().token;
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method: options.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'You appear to be offline');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, (data as { error?: string }).error ?? response.statusText);
  return data as T;
}
