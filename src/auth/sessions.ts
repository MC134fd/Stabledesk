import { randomBytes } from "node:crypto";
import { getDatabase } from "../db/database.js";

export const SESSION_COOKIE = "sd_session";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // seconds (for cookie)

export function createSession(userId: string): string {
  const sessionId = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
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
