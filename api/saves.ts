import { requireUser } from '../server/auth.js';
import { logEvent } from '../server/db.js';
import { HttpError, json, queryParam, readBody, route } from '../server/http.js';

const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64;

/** Add a Mix (curated or created) to the person's library. */
export const POST = route(async request => {
  const { sql, user } = await requireUser(request);
  const { mixId } = await readBody<{ mixId?: string }>(request);
  if (!validId(mixId)) throw new HttpError(400, 'Invalid Mix');
  const rows = await sql`insert into saves (user_id, mix_id) values (${user.id}, ${mixId}) on conflict do nothing returning mix_id`;
  if (rows[0]) {
    await sql`update mixes set save_count = save_count + 1 where id = ${mixId}`;
    await logEvent(sql, user.id, 'mix_saved', { mixId, source: 'library' });
  }
  return json({ ok: true });
});

export const DELETE = route(async request => {
  const { sql, user } = await requireUser(request);
  const mixId = queryParam(request, 'mixId');
  if (!validId(mixId)) throw new HttpError(400, 'Invalid Mix');
  const rows = await sql`delete from saves where user_id = ${user.id} and mix_id = ${mixId} returning mix_id`;
  if (rows[0]) await sql`update mixes set save_count = greatest(save_count - 1, 0) where id = ${mixId}`;
  return json({ ok: true });
});
