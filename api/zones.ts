import { requireUser } from '../server/auth.js';
import { HttpError, json, readBody, route } from '../server/http.js';

const STATES = new Set(['active', 'paused', 'completed', 'ended']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Record the start of a Zone. The client generates the id so it works offline first. */
export const POST = route(async request => {
  const { sql, user } = await requireUser(request);
  const body = await readBody<{ id?: string; mixId?: string; selectedMinutes?: number | null }>(request);
  if (!body.id || !UUID.test(body.id) || typeof body.mixId !== 'string' || body.mixId.length > 64) throw new HttpError(400, 'Invalid Zone');
  const minutes = body.selectedMinutes == null ? null : Math.round(Number(body.selectedMinutes));
  if (minutes !== null && !(minutes > 0 && minutes <= 24 * 60)) throw new HttpError(400, 'Invalid Zone duration');

  const rows = await sql`
    insert into zones (id, user_id, mix_id, selected_minutes, state) values (${body.id}, ${user.id}, ${body.mixId}, ${minutes}, 'active')
    on conflict (id) do nothing returning id`;
  if (rows[0]) await sql`update mixes set usage_count = usage_count + 1 where id = ${body.mixId}`;
  return json({ ok: true }, 201);
});

export const PATCH = route(async request => {
  const { sql, user } = await requireUser(request);
  const body = await readBody<{ id?: string; state?: string; activeSeconds?: number }>(request);
  if (!body.id || !body.state || !STATES.has(body.state)) throw new HttpError(400, 'Invalid Zone update');
  const seconds = Math.max(0, Math.round(Number(body.activeSeconds) || 0));
  const finished = body.state === 'completed' || body.state === 'ended';
  await sql`
    update zones set state = ${body.state}, active_seconds = greatest(active_seconds, ${seconds}),
      ended_at = case when ${finished} then now() else ended_at end
    where id = ${body.id} and user_id = ${user.id} and state not in ('completed', 'ended')`;
  return json({ ok: true });
});
