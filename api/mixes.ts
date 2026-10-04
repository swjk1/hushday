import { requireUser } from '../server/auth.js';
import { logEvent } from '../server/db.js';
import { HttpError, json, queryParam, readBody, route } from '../server/http.js';
import { discover, fingerprintOf, loadMix, parseDraft, toMix } from '../server/mixes.js';
import { recommendScenarios } from '../src/core/scenarios.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The signed-in person's created Mixes and saved Mix ids. */
export const GET = route(async request => {
  const { sql, user } = await requireUser(request);
  const rows = await sql`
    select m.*, f.discoverer_count, f.first_discoverer_id
    from mixes m left join discovery_families f on f.id = m.family_id
    where m.creator_id = ${user.id} and m.deleted_at is null
    order by m.created_at desc limit 200`;
  const saves = await sql`select mix_id from saves where user_id = ${user.id} order by created_at desc`;
  return json({ mixes: rows.map(toMix), saved: saves.map(row => row.mix_id) });
});

/** Save a new Mix: fingerprint it and hand out a discovery number. Idempotent on the client id. */
export const POST = route(async request => {
  const { sql, user } = await requireUser(request);
  const body = await readBody<{ id?: string; mix?: unknown }>(request);
  const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id.toLowerCase() : null;
  if (!id) throw new HttpError(400, 'Missing Mix id');

  const existing = await sql`select creator_id from mixes where id = ${id}`;
  if (existing[0]) {
    if (existing[0].creator_id !== user.id) throw new HttpError(409, 'Mix id already used');
    const mix = await loadMix(sql, id);
    return json({ mix, discovery: mix?.discovery ? { ...mix.discovery, alreadyDiscovered: true } : null });
  }

  const draft = parseDraft(body.mix);
  const { canonical, fingerprint } = fingerprintOf(draft);
  await logEvent(sql, user.id, 'mix_fingerprint_generated', { mixId: id, fingerprint, canonical });
  const discovery = await discover(sql, user.id, id, canonical, fingerprint);

  await sql`
    insert into mixes (id, creator_id, name, length_sec, repeat_mode, components, fingerprint, fingerprint_version, family_id, discovery_number, parent_mix_id, blend)
    values (${id}, ${user.id}, ${draft.name}, ${draft.lengthSec}, ${draft.repeat}, ${JSON.stringify(draft.components)}::jsonb,
            ${fingerprint}, 1, ${discovery.familyId}, ${discovery.number}, ${draft.parentMixId ?? null}, ${draft.blend ? JSON.stringify(draft.blend) : null}::jsonb)`;
  await logEvent(sql, user.id, 'mix_created', { mixId: id, fingerprint, parentMixId: draft.parentMixId ?? null, components: draft.components.length, blend: draft.blend?.on ?? false, sounds: [...new Set(draft.components.map(c => c.sound))], scenarios: recommendScenarios(draft).map(s => s.id) });

  return json({ mix: await loadMix(sql, id), discovery }, 201);
});

/** Edit a Mix. If its structure changed, it becomes a new discovery. */
export const PATCH = route(async request => {
  const { sql, user } = await requireUser(request);
  const id = queryParam(request, 'id') ?? '';
  const current = await loadMix(sql, id);
  if (!current || current.creatorId !== user.id) throw new HttpError(404, 'Mix not found');

  const draft = parseDraft((await readBody<{ mix?: unknown }>(request)).mix);
  const { canonical, fingerprint } = fingerprintOf(draft);
  const changed = fingerprint !== current.discovery?.fingerprint;
  let discovery = current.discovery ?? null;
  if (changed) {
    await logEvent(sql, user.id, 'mix_fingerprint_generated', { mixId: id, fingerprint, canonical });
    discovery = await discover(sql, user.id, id, canonical, fingerprint);
  }

  await sql`
    update mixes set name = ${draft.name}, length_sec = ${draft.lengthSec}, repeat_mode = ${draft.repeat},
      components = ${JSON.stringify(draft.components)}::jsonb, fingerprint = ${fingerprint}, blend = ${draft.blend ? JSON.stringify(draft.blend) : null}::jsonb,
      family_id = ${discovery?.familyId ?? null}, discovery_number = ${discovery?.number ?? null}, updated_at = now()
    where id = ${id}`;
  await logEvent(sql, user.id, 'mix_edited', { mixId: id, structureChanged: changed, blend: draft.blend?.on ?? false, sounds: [...new Set(draft.components.map(c => c.sound))], scenarios: recommendScenarios(draft).map(s => s.id) });

  return json({ mix: await loadMix(sql, id), discovery: changed ? discovery : null });
});

/** Soft delete. The discovery stays in the person's history. */
export const DELETE = route(async request => {
  const { sql, user } = await requireUser(request);
  const id = queryParam(request, 'id') ?? '';
  const rows = await sql`update mixes set deleted_at = now() where id = ${id} and creator_id = ${user.id} and deleted_at is null returning id`;
  if (!rows[0]) throw new HttpError(404, 'Mix not found');
  await logEvent(sql, user.id, 'mix_deleted', { mixId: id });
  return json({ ok: true });
});
