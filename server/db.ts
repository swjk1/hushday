import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { HttpError } from './http.js';

export type Sql = NeonQueryFunction<false, false>;

// Idempotent schema, applied once per function instance. Ids are text so curated Mixes
// ("c-locked-in") and user Mixes (uuids) share one id space in zones, saves and events.
const SCHEMA = [
  `create table if not exists users (
    id text primary key,
    username text not null unique,
    token_hash text not null unique,
    settings jsonb not null default '{}',
    created_at timestamptz not null default now()
  )`,
  `create table if not exists discovery_families (
    id text primary key,
    fingerprint text not null unique,
    fingerprint_version int not null,
    canonical text not null,
    first_discoverer_id text references users(id),
    first_mix_id text,
    discoverer_count int not null default 0,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists mixes (
    id text primary key,
    creator_id text references users(id),
    name text not null,
    length_sec int not null,
    repeat_mode text not null,
    components jsonb not null,
    fingerprint text,
    fingerprint_version int,
    family_id text references discovery_families(id),
    discovery_number int,
    parent_mix_id text,
    usage_count int not null default 0,
    save_count int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
  )`,
  `create index if not exists mixes_creator_idx on mixes (creator_id, created_at desc) where deleted_at is null`,
  // Auto-Blend setting ({ on, v }); null for Mixes saved before it existed, which play as the original.
  `alter table mixes add column if not exists blend jsonb`,
  `create index if not exists mixes_family_idx on mixes (family_id)`,
  `create table if not exists discoveries (
    family_id text not null references discovery_families(id),
    user_id text not null references users(id),
    number int not null,
    mix_id text not null,
    created_at timestamptz not null default now(),
    primary key (family_id, user_id)
  )`,
  `create table if not exists saves (
    user_id text not null references users(id),
    mix_id text not null,
    created_at timestamptz not null default now(),
    primary key (user_id, mix_id)
  )`,
  `create table if not exists zones (
    id text primary key,
    user_id text not null references users(id),
    mix_id text not null,
    selected_minutes int,
    state text not null,
    active_seconds int not null default 0,
    started_at timestamptz not null default now(),
    ended_at timestamptz
  )`,
  `create index if not exists zones_user_idx on zones (user_id, started_at desc)`,
  `create table if not exists events (
    id bigserial primary key,
    user_id text,
    name text not null,
    props jsonb not null default '{}',
    client_ts timestamptz,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists events_name_time_idx on events (name, created_at)`,
];

let client: Sql | null = null;
let ready: Promise<void> | null = null;

export async function db(): Promise<Sql> {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith('postgres')) throw new HttpError(503, 'The discovery service is not configured');
  const sql = (client ??= neon(url));
  ready ??= (async () => {
    for (const statement of SCHEMA) await sql.query(statement);
  })().catch(error => {
    ready = null;
    throw error;
  });
  await ready;
  return sql;
}

export async function logEvent(sql: Sql, userId: string | null, name: string, props: Record<string, unknown> = {}) {
  await sql`insert into events (user_id, name, props) values (${userId}, ${name}, ${JSON.stringify(props)}::jsonb)`;
}
