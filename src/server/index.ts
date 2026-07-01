import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { cookieName, createSession, requireAuth } from "./auth.js";
import { prisma } from "./db.js";
import { calculatePayroll } from "./payroll.js";

const app = new Hono();
const api = new Hono();

api.post("/login", async (c) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return c.json({ message: "ADMIN_EMAIL and ADMIN_PASSWORD must be set" }, 500);
  }

  const body = await c.req.json<{ email?: string; password?: string }>();
  const ok = body.email === adminEmail && body.password === adminPassword;
  if (!ok) return c.json({ message: "Invalid email or password" }, 401);

  setCookie(c, cookieName, createSession(adminEmail), {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
  return c.json({ email: adminEmail });
});

api.post("/logout", (c) => {
  deleteCookie(c, cookieName, { path: "/" });
  return c.json({ ok: true });
});

api.use("*", requireAuth);

api.get("/me", (c) => c.json({ email: process.env.ADMIN_EMAIL ?? "" }));

api.get("/settings", async (c) => {
  const settings = await prisma.companySetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" }
  });
  return c.json(settings);
});

api.put("/settings", async (c) => {
  const body = await c.req.json();
  const settings = await prisma.companySetting.upsert({
    where: { id: "default" },
    update: {
      overtimeRate: Number(body.overtimeRate),
      incomeTaxRate: Number(body.incomeTaxRate),
      socialInsuranceRate: Number(body.socialInsuranceRate),
      employmentInsuranceRate: Number(body.employmentInsuranceRate)
    },
    create: {
      id: "default",
      overtimeRate: Number(body.overtimeRate),
      incomeTaxRate: Number(body.incomeTaxRate),
      socialInsuranceRate: Number(body.socialInsuranceRate),
      employmentInsuranceRate: Number(body.employmentInsuranceRate)
    }
  });
  return c.json(settings);
});

api.get("/employees", async (c) => {
  const q = c.req.query("q") || "";
  const employees = await prisma.employee.findMany({
    where: {
      isActive: true,
      OR: q ? [{ name: { contains: q, mode: "insensitive" } }, { employeeNo: { contains: q, mode: "insensitive" } }] : undefined
    },
    orderBy: { employeeNo: "asc" }
  });
  return c.json(employees);
});

api.post("/employees", async (c) => {
  const body = await c.req.json();
  const employee = await prisma.employee.create({
    data: {
      employeeNo: String(body.employeeNo),
      name: String(body.name),
      payType: body.payType === "HOURLY" ? "HOURLY" : "MONTHLY",
      basePay: Number(body.basePay || 0),
      memo: body.memo || null
    }
  });
  return c.json(employee, 201);
});

api.put("/employees/:id", async (c) => {
  const body = await c.req.json();
  const employee = await prisma.employee.update({
    where: { id: c.req.param("id") },
    data: {
      employeeNo: String(body.employeeNo),
      name: String(body.name),
      payType: body.payType === "HOURLY" ? "HOURLY" : "MONTHLY",
      basePay: Number(body.basePay || 0),
      memo: body.memo || null
    }
  });
  return c.json(employee);
});

api.delete("/employees/:id", async (c) => {
  await prisma.employee.update({ where: { id: c.req.param("id") }, data: { isActive: false } });
  return c.json({ ok: true });
});

api.get("/payrolls", async (c) => {
  const period = c.req.query("period");
  const employeeId = c.req.query("employeeId");
  const payrolls = await prisma.payroll.findMany({
    where: { period: period || undefined, employeeId: employeeId || undefined },
    include: { employee: true },
    orderBy: [{ period: "desc" }, { employee: { employeeNo: "asc" } }]
  });
  return c.json(payrolls);
});

api.post("/payrolls", async (c) => {
  const body = await c.req.json();
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: String(body.employeeId) } });
  const settings = await prisma.companySetting.findUniqueOrThrow({ where: { id: "default" } });
  const overtimeRate = Number(body.overtimeRate ?? settings.overtimeRate);
  const incomeTaxRate = Number(body.incomeTaxRate ?? settings.incomeTaxRate);
  const socialInsuranceRate = Number(body.socialInsuranceRate ?? settings.socialInsuranceRate);
  const employmentInsuranceRate = Number(body.employmentInsuranceRate ?? settings.employmentInsuranceRate);
  const workHours = Number(body.workHours || 0);
  const overtimeHours = Number(body.overtimeHours || 0);
  const allowance = Number(body.allowance || 0);
  const fixedDeduction = Number(body.fixedDeduction || 0);
  const calculated = calculatePayroll({
    payType: employee.payType,
    basePay: employee.basePay,
    workHours,
    overtimeHours,
    allowance,
    fixedDeduction,
    overtimeRate,
    incomeTaxRate,
    socialInsuranceRate,
    employmentInsuranceRate
  });

  const payroll = await prisma.payroll.upsert({
    where: { employeeId_period: { employeeId: employee.id, period: String(body.period) } },
    update: {
      workDays: Number(body.workDays || 0),
      workHours,
      overtimeHours,
      allowance,
      fixedDeduction,
      overtimeRate,
      incomeTaxRate,
      socialInsuranceRate,
      employmentInsuranceRate,
      ...calculated,
      note: body.note || null
    },
    create: {
      employeeId: employee.id,
      period: String(body.period),
      workDays: Number(body.workDays || 0),
      workHours,
      overtimeHours,
      allowance,
      fixedDeduction,
      overtimeRate,
      incomeTaxRate,
      socialInsuranceRate,
      employmentInsuranceRate,
      ...calculated,
      note: body.note || null
    },
    include: { employee: true }
  });
  return c.json(payroll);
});

app.route("/api", api);
app.use("/assets/*", serveStatic({ root: "./dist" }));
app.use("*", serveStatic({ path: "./dist/index.html" }));

//serve({ fetch: app.fetch, port: Number(process.env.PORT || 3000) });
serve({
  fetch: app.fetch,
  port: Number(process.env.PORT || 3000),
  hostname: '0.0.0.0' // 👈 这一行至关重要！
});
