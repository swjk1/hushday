import { db } from '../server/db.js';
import { HttpError, json, queryParam, route } from '../server/http.js';
import { fingerprintFor } from '../server/mixes.js';

/**
 * How many people have already found a Mix, before saving it, so the editor can say
 * "you'd be the 13th". Takes the canonical form (computed by the shared core on the client);
 * it is only used to look up a count, never stored.
 */
export const GET = route(async request => {
  const canonical = queryParam(request, 'c') ?? '';
  if (!/^v\d+\|/.test(canonical) || canonical.length > 1000) throw new HttpError(400, 'Invalid Mix');
  const sql = await db();
  const rows = await sql`select discoverer_count from discovery_families where fingerprint = ${fingerprintFor(canonical)}`;
  return json({ count: (rows[0]?.discoverer_count as number | undefined) ?? 0 });
});
