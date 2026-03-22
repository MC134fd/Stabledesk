import { randomBytes } from "node:crypto";
import { getDatabase } from "../db/database.js";

export const SESSION_COOKIE = "sd_session";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_TTL_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // seconds (for cookie)
export const SESSION_MAX_AGE_REMEMBER = 30 * 24 * 60 * 60; // 30 days in seconds

export function createSession(userId: string, rememberMe?: boolean): string {
  const sessionId = randomBytes(32).toString("hex");
  const ttl = rememberMe ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl).toISOString();
  getDatabase()
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .run(sessionId, userId, expiresAt);
  return sessionId;
}

export function getSession(sessionId: string): { userId: string } | null {
  const db = getDatabase();
  const row = db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?")
    .get(sessionId) as { user_id: string; expires_at: string } | undefined;

  if (!row) return null;

  if (new Date(row.expires_at) <= new Date()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return null;
  }

  return { userId: row.user_id };
}

export function deleteSession(sessionId: string): void {
  getDatabase().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}
