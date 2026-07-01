import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";

const cookieName = "payroll_session";

function secret() {
  return process.env.SESSION_SECRET || "dev-only-secret";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSession(email: string) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 1000 * 60 * 60 * 12 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token?: string) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp: number };
  return data.exp > Date.now();
}

export async function requireAuth(c: Context, next: Next) {
  if (!verifySession(getCookie(c, cookieName))) {
    return c.json({ message: "ログインが必要です" }, 401);
  }
  return next();
}

export { cookieName };
