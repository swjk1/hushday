import { cleanUsername, publicUser, requireUser, type UserRow } from '../server/auth.js';
import { HttpError, json, readBody, route } from '../server/http.js';

/** Profile, lifetime stats and discovery history. */
export const GET = route(async request => {
  const { sql, user } = await requireUser(request);
  const [stats] = await sql`
    select
      (select count(*)::int from mixes where creator_id = ${user.id} and deleted_at is null) as mixes_created,
      (select count(*)::int from discoveries where user_id = ${user.id}) as discoveries,
      (select count(*)::int from discovery_families where first_discoverer_id = ${user.id}) as first_discoveries,
      (select count(*)::int from zones where user_id = ${user.id} and state = 'completed') as zones_completed,
      (select coalesce(sum(active_seconds), 0)::int from zones where user_id = ${user.id}) as zone_seconds`;
  const history = await sql`
    select d.number, d.created_at, d.mix_id, m.name as mix_name, m.deleted_at is not null as mix_deleted,
           f.discoverer_count, f.first_discoverer_id = d.user_id as first
    from discoveries d
    join discovery_families f on f.id = d.family_id
    left join mixes m on m.id = d.mix_id
    where d.user_id = ${user.id}
    order by d.created_at desc limit 100`;
  return json({
    user: publicUser(user),
    stats: {
      mixesCreated: stats.mixes_created, discoveries: stats.discoveries, firstDiscoveries: stats.first_discoveries,
      zonesCompleted: stats.zones_completed, zoneSeconds: stats.zone_seconds,
    },
    discoveries: history.map(row => ({
      number: row.number, first: row.first, mixId: row.mix_id, mixName: row.mix_name ?? 'Deleted Mix',
      mixDeleted: row.mix_deleted ?? true, totalDiscoverers: row.discoverer_count, createdAt: new Date(row.created_at).toISOString(),
    })),
  });
});

export const PATCH = route(async request => {
  const { sql, user } = await requireUser(request);
  const username = cleanUsername((await readBody<{ username?: unknown }>(request)).username);
  const rows = await sql`
    update users set username = ${username} where id = ${user.id}
      and not exists (select 1 from users where username = ${username} and id <> ${user.id})
    returning id, username, created_at`;
  if (!rows[0]) throw new HttpError(409, 'That name is taken');
  return json({ user: publicUser(rows[0] as UserRow) });
});
