import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { pool } from "../db/pool.js";

export type AccessTokenPayload = { sub: string; email: string };

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.jwt.accessSecret, { expiresIn: config.jwt.accessTtl });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.jwt.accessSecret) as AccessTokenPayload;
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt],
  );
  return raw;
}

export async function consumeRefreshToken(raw: string): Promise<string | null> {
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const { rows } = await pool.query<{ token_id: string; user_id: string }>(
    `SELECT token_id, user_id
       FROM refresh_tokens
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > now()`,
    [hash],
  );
  const row = rows[0];
  if (!row) return null;
  await pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_id = $1`, [
    row.token_id,
  ]);
  return row.user_id;
}
