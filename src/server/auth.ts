import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";

const cookieName = "payroll_session";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "ACCOUNTING" | "VIEWER" | "EMPLOYEE";
  employeeId?: string | null;
};

function secret() {
  return process.env.SESSION_SECRET || "dev-only-secret";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSession(user: SessionUser) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 1000 * 60 * 60 * 12 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token?: string) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser & { exp: number };
  if (data.exp <= Date.now()) return null;
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role,
    employeeId: data.employeeId ?? null
  };
}

export async function requireAuth(c: Context, next: Next) {
  const user = verifySession(getCookie(c, cookieName));
  if (!user) {
    return c.json({ message: "Authentication required" }, 401);
  }
  c.set("user", user);
  return next();
}

export { cookieName };
