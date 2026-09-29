import { createHash, randomBytes, randomUUID } from 'node:crypto';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Wraps a Web-standard handler so thrown HttpErrors become JSON responses. */
export function route(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: 'Something went wrong' }, 500);
    }
  };
}

export async function readBody<T = Record<string, unknown>>(request: Request, limit = 64_000): Promise<T> {
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, 'Request too large');
  try {
    return JSON.parse(text || '{}') as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

export const newId = () => randomUUID();
export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export function bearer(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
}

export const queryParam = (request: Request, name: string) => new URL(request.url).searchParams.get(name);
