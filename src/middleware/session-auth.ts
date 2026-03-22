import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { getSession, SESSION_COOKIE } from "../auth/sessions.js";

/**
 * Middleware that enforces a valid session for HTML routes.
 * Unauthenticated requests are redirected to /login.
 */
export async function requireSession(
  c: Context,
  next: Next,
): Promise<Response | void> {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId || !getSession(sessionId)) {
    return c.redirect("/login");
  }
  return next();
}

/**
 * Middleware that enforces a valid session for JSON API routes.
 * Returns 401 JSON instead of redirecting.
 */
export async function requireApiSession(
  c: Context,
  next: Next,
): Promise<Response | void> {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId || !getSession(sessionId)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
}
