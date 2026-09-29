import { publicUser, randomUsername, type UserRow } from '../server/auth.js';
import { db, logEvent } from '../server/db.js';
import { HttpError, hashToken, json, newId, newToken, route } from '../server/http.js';

/**
 * Creates an anonymous account bound to this device. The token is shown once and stored
 * only as a hash. Real sign-in can later attach to the same user row.
 */
export const POST = route(async () => {
  const sql = await db();
  const token = newToken();
  for (let attempt = 0; attempt < 6; attempt++) {
    const rows = await sql`
      insert into users (id, username, token_hash) values (${newId()}, ${randomUsername()}, ${hashToken(token)})
      on conflict (username) do nothing
      returning id, username, created_at`;
    if (rows[0]) {
      const user = rows[0] as UserRow;
      await logEvent(sql, user.id, 'account_created');
      return json({ token, user: publicUser(user) }, 201);
    }
  }
  throw new HttpError(500, 'Could not create an account');
});
