import { FINGERPRINT_VERSION, canonicalize } from '../src/core/fingerprint.js';
import type { Discovery, Mix, MixDraft } from '../src/core/types.js';
import { MixValidationError, sanitizeDraft } from '../src/core/validate.js';
import { logEvent, type Sql } from './db.js';
import { HttpError, newId, sha256 } from './http.js';

export function parseDraft(input: unknown): MixDraft {
  try {
    return sanitizeDraft(input);
  } catch (error) {
    if (error instanceof MixValidationError) throw new HttpError(400, error.message);
    throw error;
  }
}

export const fingerprintFor = (canonical: string) => sha256(canonical).slice(0, 24);

export function fingerprintOf(draft: MixDraft) {
  const canonical = canonicalize(draft);
  return { canonical, fingerprint: fingerprintFor(canonical) };
}

/**
 * Assigns a discovery number for `userId` finding `fingerprint`.
 * Each person gets one number per family; saving the same structure again returns it.
 * The first person to reach a fingerprint creates the family and becomes its first discoverer.
 */
export async function discover(sql: Sql, userId: string, mixId: string, canonical: string, fingerprint: string): Promise<Discovery> {
  const prior = await sql`
    select d.number, f.id as family_id, f.discoverer_count, f.first_discoverer_id
    from discoveries d join discovery_families f on f.id = d.family_id
    where f.fingerprint = ${fingerprint} and d.user_id = ${userId}`;
  if (prior[0]) {
    const row = prior[0];
    return {
      familyId: row.family_id, number: row.number, first: row.first_discoverer_id === userId,
      alreadyDiscovered: true, totalDiscoverers: row.discoverer_count, fingerprint,
    };
  }

  const candidateId = newId();
  const [family] = await sql`
    insert into discovery_families (id, fingerprint, fingerprint_version, canonical, first_discoverer_id, first_mix_id, discoverer_count)
    values (${candidateId}, ${fingerprint}, ${FINGERPRINT_VERSION}, ${canonical}, ${userId}, ${mixId}, 1)
    on conflict (fingerprint) do update set discoverer_count = discovery_families.discoverer_count + 1
    returning id, discoverer_count`;
  const first = family.id === candidateId;
  const number = family.discoverer_count as number;
  await sql`
    insert into discoveries (family_id, user_id, number, mix_id) values (${family.id}, ${userId}, ${number}, ${mixId})
    on conflict do nothing`;

  await logEvent(sql, userId, 'discovery_number_assigned', { mixId, number, fingerprint });
  if (first) await logEvent(sql, userId, 'first_discovery_created', { mixId, fingerprint });
  return { familyId: family.id, number, first, alreadyDiscovered: false, totalDiscoverers: number, fingerprint };
}

type Row = Record<string, any>;

export function toMix(row: Row): Mix {
  const discovery: Discovery | null = row.family_id
    ? {
        familyId: row.family_id, number: row.discovery_number, first: row.first_discoverer_id === row.creator_id,
        alreadyDiscovered: false, totalDiscoverers: row.discoverer_count ?? row.discovery_number, fingerprint: row.fingerprint,
      }
    : null;
  return {
    id: row.id, name: row.name, lengthSec: row.length_sec, repeat: row.repeat_mode, components: row.components,
    parentMixId: row.parent_mix_id, creatorId: row.creator_id, curated: false, createdAt: new Date(row.created_at).toISOString(),
    discovery, sync: 'synced',
    ...(row.blend ? { blend: row.blend } : {}),
  };
}

export async function loadMix(sql: Sql, id: string): Promise<Mix | null> {
  const rows = await sql`
    select m.*, f.discoverer_count, f.first_discoverer_id
    from mixes m left join discovery_families f on f.id = m.family_id
    where m.id = ${id} and m.deleted_at is null`;
  return rows[0] ? toMix(rows[0]) : null;
}
