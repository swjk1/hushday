import { db, type Sql } from './db.js';
import { HttpError, bearer, hashToken } from './http.js';

export interface UserRow {
  id: string;
  username: string;
  created_at: string;
}

export const publicUser = (row: UserRow) => ({ id: row.id, username: row.username, createdAt: row.created_at });

export async function findUser(sql: Sql, token: string | null): Promise<UserRow | null> {
  if (!token) return null;
  const rows = await sql`select id, username, created_at from users where token_hash = ${hashToken(token)}`;
  return (rows[0] as UserRow | undefined) ?? null;
}

export async function requireUser(request: Request) {
  const sql = await db();
  const user = await findUser(sql, bearer(request));
  if (!user) throw new HttpError(401, 'Session expired');
  return { sql, user };
}

const ADJECTIVES = ['still', 'low', 'soft', 'deep', 'warm', 'slow', 'calm', 'grey', 'late', 'quiet', 'far', 'dim', 'brown', 'pale', 'wide', 'lone'];
const NOUNS = ['heron', 'harbor', 'static', 'tide', 'lantern', 'meadow', 'signal', 'ember', 'current', 'drift', 'echo', 'rain', 'reef', 'field', 'orbit', 'wake'];
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

export const randomUsername = () => `${pick(ADJECTIVES)}-${pick(NOUNS)}-${100 + Math.floor(Math.random() * 900)}`;

export function cleanUsername(value: unknown) {
  const name = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9_-]{2,23}$/.test(name)) {
    throw new HttpError(400, 'Use 3–24 letters, numbers, dashes or underscores');
  }
  return name;
}
