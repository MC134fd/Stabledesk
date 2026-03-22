import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/database.js";
import {
  createSession,
  getSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  SESSION_MAX_AGE_REMEMBER,
} from "./sessions.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = process.env.NODE_ENV === "test" ? 4 : 12;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function createAuthRoutes() {
  const app = new Hono();

  // POST /auth/register — only the first user may register
  app.post("/register", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password =
      typeof body.password === "string" ? body.password : "";

    if (!email || !EMAIL_RE.test(email)) {
      return c.json({ error: "A valid email address is required" }, 400);
    }
    if (password.length < 8) {
      return c.json(
        { error: "Password must be at least 8 characters" },
        400,
      );
    }

    const db = getDatabase();
    const count = (
      db.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number }
    ).n;
    if (count > 0) {
      return c.json({ error: "Registration is closed" }, 403);
    }

    const id = randomUUID();
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    db.prepare(
      "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
    ).run(id, email, hash);

    const sessionId = createSession(id);
    setCookie(c, SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "Lax",
      secure: isProduction(),
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    return c.json({ user: { id, email } }, 201);
  });

  // POST /auth/login
  app.post("/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password =
      typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const rememberMe = typeof body.rememberMe === "boolean" ? body.rememberMe : false;

    const db = getDatabase();
    const user = db
      .prepare(
        "SELECT id, email, password_hash FROM users WHERE email = ?",
      )
      .get(email) as
      | { id: string; email: string; password_hash: string }
      | undefined;

    // Always run bcrypt to prevent timing attacks
    const hashToCompare =
      user?.password_hash ??
      "$2a$12$invalidhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    const valid = await bcrypt.compare(password, hashToCompare);

    if (!user || !valid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const sessionId = createSession(user.id, rememberMe);
    const maxAge = rememberMe ? SESSION_MAX_AGE_REMEMBER : SESSION_MAX_AGE;
    setCookie(c, SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "Lax",
      secure: isProduction(),
      maxAge,
      path: "/",
    });

    return c.json({ user: { id: user.id, email: user.email } });
  });

  // POST /auth/logout
  app.post("/logout", (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (sessionId) {
      deleteSession(sessionId);
    }
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // GET /auth/me
  app.get("/me", (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return c.json({ error: "Unauthorized" }, 401);

    const session = getSession(sessionId);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const db = getDatabase();
    const user = db
      .prepare("SELECT id, email, created_at FROM users WHERE id = ?")
      .get(session.userId) as
      | { id: string; email: string; created_at: string }
      | undefined;

    if (!user) return c.json({ error: "Unauthorized" }, 401);

    return c.json({ id: user.id, email: user.email, createdAt: user.created_at });
  });

  return app;
}
