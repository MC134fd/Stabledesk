import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDatabase, closeDatabase } from "../../src/db/database.js";
import {
  createSession,
  getSession,
  deleteSession,
} from "../../src/auth/sessions.js";
import { createAuthRoutes } from "../../src/auth/auth-routes.js";

// Use an in-memory SQLite database for all auth tests
beforeEach(() => {
  process.env.DB_PATH = ":memory:";
  process.env.NODE_ENV = "test";
  closeDatabase(); // reset singleton — next getDatabase() creates a fresh in-memory DB
});

afterEach(() => {
  closeDatabase();
});

// ─── SESSION UNIT TESTS ───────────────────────────────────────────────────────

describe("session management", () => {
  it("createSession returns a 64-char hex string", () => {
    const db = getDatabase();
    db.prepare(
      "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
    ).run("u1", "a@b.com", "hash");

    const id = createSession("u1");
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("getSession returns userId for a valid session", () => {
    const db = getDatabase();
    db.prepare(
      "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
    ).run("u2", "b@b.com", "hash");

    const id = createSession("u2");
    const session = getSession(id);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe("u2");
  });

  it("getSession returns null for unknown session ID", () => {
    getDatabase(); // ensure schema exists
    expect(getSession("nonexistent")).toBeNull();
  });

  it("getSession returns null and cleans up expired sessions", () => {
    const db = getDatabase();
    db.prepare(
      "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
    ).run("u3", "c@b.com", "hash");

    // Insert a session that expired in the past
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    db.prepare(
      "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
    ).run("expired-id", "u3", pastExpiry);

    expect(getSession("expired-id")).toBeNull();

    // Confirm the expired session was deleted from DB
    const row = db
      .prepare("SELECT id FROM sessions WHERE id = ?")
      .get("expired-id");
    expect(row).toBeUndefined();
  });

  it("deleteSession removes the session", () => {
    const db = getDatabase();
    db.prepare(
      "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
    ).run("u4", "d@b.com", "hash");

    const id = createSession("u4");
    expect(getSession(id)).not.toBeNull();
    deleteSession(id);
    expect(getSession(id)).toBeNull();
  });
});

// ─── AUTH ROUTE INTEGRATION TESTS ────────────────────────────────────────────

describe("POST /register", () => {
  it("creates the first user and returns 201", async () => {
    const app = createAuthRoutes();
    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "password123" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe("admin@test.com");
    expect(body.id).toBeTruthy();
  });

  it("rejects a second registration with 403", async () => {
    const app = createAuthRoutes();
    await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "first@test.com", password: "password123" }),
    });
    const res2 = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "second@test.com", password: "password123" }),
    });
    expect(res2.status).toBe(403);
  });

  it("rejects invalid email with 400", async () => {
    const app = createAuthRoutes();
    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "password123" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects short password with 400", async () => {
    const app = createAuthRoutes();
    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "short" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /login", () => {
  async function registerUser(app: ReturnType<typeof createAuthRoutes>) {
    await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@test.com", password: "securepass1" }),
    });
  }

  it("returns 200 and sets a session cookie on valid credentials", async () => {
    const app = createAuthRoutes();
    await registerUser(app);

    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@test.com", password: "securepass1" }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.email).toBe("user@test.com");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("sd_session=");
    expect(setCookie).toContain("HttpOnly");
  });

  it("returns 401 on wrong password", async () => {
    const app = createAuthRoutes();
    await registerUser(app);

    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@test.com", password: "wrongpassword" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid credentials");
  });

  it("returns 401 for a missing user", async () => {
    const app = createAuthRoutes();
    getDatabase(); // ensure schema exists

    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@test.com", password: "password123" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing required fields", async () => {
    const app = createAuthRoutes();
    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@test.com" }), // no password
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /me", () => {
  it("returns 401 with no cookie", async () => {
    const app = createAuthRoutes();
    getDatabase(); // ensure schema exists
    const res = await app.request("/me");
    expect(res.status).toBe(401);
  });

  it("returns user info for a valid session cookie", async () => {
    const app = createAuthRoutes();
    const regRes = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "me@test.com", password: "password123" }),
    });
    const cookie = regRes.headers.get("set-cookie") ?? "";
    const sessionId = cookie.split(";")[0].split("=")[1];

    const res = await app.request("/me", {
      headers: { Cookie: `sd_session=${sessionId}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("me@test.com");
  });
});

describe("POST /logout", () => {
  it("clears the session and returns ok", async () => {
    const app = createAuthRoutes();
    const regRes = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "logout@test.com", password: "password123" }),
    });
    const cookie = regRes.headers.get("set-cookie") ?? "";
    const sessionId = cookie.split(";")[0].split("=")[1];

    const res = await app.request("/logout", {
      method: "POST",
      headers: { Cookie: `sd_session=${sessionId}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Session should no longer be valid
    expect(getSession(sessionId)).toBeNull();
  });
});
