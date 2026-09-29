import { findUser } from '../server/auth.js';
import { db } from '../server/db.js';
import { HttpError, bearer, json, readBody, route } from '../server/http.js';

interface IncomingEvent { name?: unknown; props?: unknown; ts?: unknown }

/**
 * Batched usage events. Accepts the token in the body too, because navigator.sendBeacon
 * cannot set headers when the page is closing.
 */
export const POST = route(async request => {
  const body = await readBody<{ events?: IncomingEvent[]; token?: string }>(request, 128_000);
  if (!Array.isArray(body.events)) throw new HttpError(400, 'Missing events');
  const sql = await db();
  const user = await findUser(sql, bearer(request) ?? (typeof body.token === 'string' ? body.token : null));

  const events = body.events.slice(0, 100).flatMap(event => {
    if (typeof event.name !== 'string' || !/^[a-z][a-z_]{1,48}$/.test(event.name)) return [];
    const props = event.props && typeof event.props === 'object' ? event.props : {};
    if (JSON.stringify(props).length > 2000) return [];
    const time = typeof event.ts === 'string' && !Number.isNaN(Date.parse(event.ts)) ? event.ts : null;
    return [{ name: event.name, props, ts: time }];
  });
  if (events.length) {
    await sql`
      insert into events (user_id, name, props, client_ts)
      select ${user?.id ?? null}, e.name, coalesce(e.props, '{}'::jsonb), e.ts
      from jsonb_to_recordset(${JSON.stringify(events)}::jsonb) as e(name text, props jsonb, ts timestamptz)`;
  }
  return json({ accepted: events.length });
});
