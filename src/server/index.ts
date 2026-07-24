import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import type { AppUser, Bonus, Employee, Payroll, UserRole } from "@prisma/client";
import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { cookieName, createSession, requireAuth, type SessionUser } from "./auth.js";
import { prisma } from "./db.js";
import { sendPayslipMail } from "./mailer.js";
import { createBonusPdf } from "./bonusPdf.js";
import { createInvoicePdf } from "./invoicePdf.js";
import { createPayslipPdf } from "./pdf.js";
import { calculateBonus, calculatePayroll } from "./payroll.js";

const app = new Hono();
const api = new Hono();

const roleRank: Record<UserRole, number> = {
  EMPLOYEE: 0,
  VIEWER: 1,
  ACCOUNTING: 2,
  ADMIN: 3
};

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("base64url");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = pbkdf2Sync(password, salt, 120000, 32, "sha256");
  const expected = Buffer.from(hash, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function publicUser(user: AppUser & { employee?: Employee | null }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    employeeId: user.employeeId,
    isActive: user.isActive,
    employee: user.employee ? {
      id: user.employee.id,
      employeeNo: user.employee.employeeNo,
      name: user.employee.name
    } : null
  };
}

async function ensureBootstrapAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) return null;

  const existing = await prisma.appUser.findUnique({ where: { email: adminEmail } });
  if (existing) return existing;

  return prisma.appUser.create({
    data: {
      email: adminEmail,
      name: "Administrator",
      role: "ADMIN",
      passwordHash: hashPassword(adminPassword)
    }
  });
}

function currentUser(c: Context) {
  return c.get("user") as SessionUser;
}

function hasRole(user: SessionUser, role: UserRole) {
  return roleRank[user.role] >= roleRank[role];
}

function requireRole(c: Context, role: UserRole) {
  const user = currentUser(c);
  if (!hasRole(user, role)) {
    return c.json({ message: "権限がありません" }, 403);
  }
  return null;
}

function readableEmployeeId(c: Context, requestedEmployeeId?: string | null) {
  const user = currentUser(c);
  if (user.role !== "EMPLOYEE") return requestedEmployeeId || undefined;
  return user.employeeId || "__none__";
}

function canAccessEmployee(c: Context, employeeId: string) {
  const user = currentUser(c);
  return user.role !== "EMPLOYEE" || user.employeeId === employeeId;
}

function periodToFiscalYear(period: string) {
  const [year, month] = period.split("-").map(Number);
  return month >= 4 ? year : year - 1;
}

function fiscalYearFromDateByClosingMonth(date: Date, closingMonth: number) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value || date.getFullYear());
  const month = Number(parts.find((part) => part.type === "month")?.value || date.getMonth() + 1);
  return month > closingMonth ? year : year - 1;
}

function fiscalPeriodRange(fiscalYear: number, closingMonth: number) {
  const startMonth = closingMonth === 12 ? 1 : closingMonth + 1;
  const startYear = closingMonth === 12 ? fiscalYear : fiscalYear;
  const endYear = closingMonth === 12 ? fiscalYear : fiscalYear + 1;
  const startPeriod = `${startYear}-${String(startMonth).padStart(2, "0")}`;
  const endPeriod = `${endYear}-${String(closingMonth).padStart(2, "0")}`;
  return { startPeriod, endPeriod };
}

function monthPeriods(startPeriod: string, endPeriod: string) {
  const [startYear, startMonth] = startPeriod.split("-").map(Number);
  const [endYear, endMonth] = endPeriod.split("-").map(Number);
  const periods: string[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    periods.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return periods;
}

function memberActiveInPeriod(member: { startDate?: string | null; endDate?: string | null }, period: string) {
  const startPeriod = member.startDate?.slice(0, 7);
  const endPeriod = member.endDate?.slice(0, 7);
  return (!startPeriod || startPeriod <= period) && (!endPeriod || endPeriod >= period);
}

function contractActiveInPeriod(contract: { startDate?: string | null; endDate?: string | null }, period: string) {
  const startPeriod = contract.startDate?.slice(0, 7);
  const endPeriod = contract.endDate?.slice(0, 7);
  return (!startPeriod || startPeriod <= period) && (!endPeriod || endPeriod >= period);
}

function normalizeClosingMonth(value: unknown) {
  const month = numberOrDefault(value, 3);
  return month >= 1 && month <= 12 ? Math.trunc(month) : 3;
}

function isPeriod(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

async function getRatesForPeriod(period: string) {
  const fiscalYear = periodToFiscalYear(period);
  const fiscalRate = await prisma.fiscalRate.findUnique({ where: { fiscalYear } });
  if (fiscalRate) return { fiscalYear, rates: fiscalRate };

  const settings = await prisma.companySetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", currentFiscalYear: fiscalYear }
  });
  return { fiscalYear, rates: settings };
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function numberOrDefault(value: unknown, defaultValue: number) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function nullableInt(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function nullableDecimal(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

function periodForFile(value: string) {
  return value.replace("-", "");
}

function todayIso() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function endOfMonthIso(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return "";
  return new Date(year, month, 0).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function addDaysIso(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function tokyoDateParts() {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day")
  };
}

function currentTokyoPeriod() {
  const { year, month } = tokyoDateParts();
  return `${year}-${String(month).padStart(2, "0")}`;
}

function isPayrollLockedPeriod(period: string) {
  return tokyoDateParts().day >= 28 && period < currentTokyoPeriod();
}

function attachmentDisposition(fileName: string, fallbackFileName: string) {
  return `attachment; filename="${fallbackFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function findIncomeTaxAmount(input: { fiscalYear: number; dependentCount: number; taxableIncome: number }) {
  const hasFiscalYearTable = await prisma.incomeTaxBracket.count({
    where: { fiscalYear: input.fiscalYear }
  });
  const bracket = await prisma.incomeTaxBracket.findFirst({
    where: {
      fiscalYear: input.fiscalYear,
      dependentCount: input.dependentCount,
      minTaxable: { lte: input.taxableIncome },
      OR: [{ maxTaxable: null }, { maxTaxable: { gte: input.taxableIncome } }]
    },
    orderBy: { minTaxable: "desc" }
  });
  return { taxAmount: bracket?.taxAmount, hasFiscalYearTable: hasFiscalYearTable > 0 };
}

function toPayslipPdfInput(payroll: Payroll & { employee: Employee }) {
  return {
    period: payroll.period,
    employeeNo: payroll.employee.employeeNo,
    employeeName: payroll.employee.name,
    position: payroll.employee.position,
    payType: payroll.employee.payType,
    regularPay: payroll.regularPay,
    overtimePay: payroll.overtimePay,
    fixedOvertimeAllowance: payroll.fixedOvertimeAllowance,
    allowance: payroll.allowance,
    grossPay: payroll.grossPay,
    taxableIncome: payroll.taxableIncome,
    incomeTax: payroll.incomeTax,
    healthInsurance: payroll.healthInsurance,
    pensionInsurance: payroll.pensionInsurance,
    childCareSupport: payroll.childCareSupport,
    socialInsurance: payroll.socialInsurance,
    employmentInsurance: payroll.employmentInsurance,
    residentTax: payroll.residentTax,
    dormitoryFee: payroll.dormitoryFee,
    fixedDeduction: payroll.fixedDeduction,
    totalDeduction: payroll.totalDeduction,
    netPay: payroll.netPay
  };
}

function toBonusPdfInput(bonus: Bonus & { employee: Employee }) {
  return {
    period: bonus.period,
    employeeNo: bonus.employee.employeeNo,
    employeeName: bonus.employee.name,
    bonusAmount: bonus.bonusAmount,
    taxableIncome: bonus.taxableIncome,
    incomeTax: bonus.incomeTax,
    healthInsurance: bonus.healthInsurance,
    pensionInsurance: bonus.pensionInsurance,
    childCareSupport: bonus.childCareSupport,
    socialInsurance: bonus.socialInsurance,
    employmentInsurance: bonus.employmentInsurance,
    totalDeduction: bonus.totalDeduction,
    netPay: bonus.netPay
  };
}

api.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  await ensureBootstrapAdmin();

  const user = await prisma.appUser.findFirst({
    where: { email: String(body.email || ""), isActive: true }
  });
  if (!user || !verifyPassword(String(body.password || ""), user.passwordHash)) {
    return c.json({ message: "Invalid email or password" }, 401);
  }

  setCookie(c, cookieName, createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    employeeId: user.employeeId
  }), {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
  return c.json(publicUser(user));
});

api.post("/logout", (c) => {
  deleteCookie(c, cookieName, { path: "/" });
  return c.json({ ok: true });
});

api.use("*", requireAuth);

api.get("/me", (c) => c.json(currentUser(c)));

api.get("/users", async (c) => {
  const denied = requireRole(c, "ADMIN");
  if (denied) return denied;

  const users = await prisma.appUser.findMany({
    include: { employee: true },
    orderBy: [{ role: "asc" }, { email: "asc" }]
  });
  return c.json(users.map(publicUser));
});

api.post("/users", async (c) => {
  const denied = requireRole(c, "ADMIN");
  if (denied) return denied;

  const body = await c.req.json();
  const password = String(body.password || "");
  if (password.length < 8) {
    return c.json({ message: "パスワードは8文字以上にしてください" }, 400);
  }

  const role = ["ADMIN", "ACCOUNTING", "VIEWER", "EMPLOYEE"].includes(String(body.role))
    ? String(body.role) as UserRole
    : "VIEWER";
  const user = await prisma.appUser.create({
    data: {
      email: String(body.email),
      name: String(body.name || body.email),
      role,
      employeeId: role === "EMPLOYEE" ? body.employeeId || null : body.employeeId || null,
      passwordHash: hashPassword(password),
      isActive: body.isActive !== false
    },
    include: { employee: true }
  });
  return c.json(publicUser(user), 201);
});

api.put("/users/:id", async (c) => {
  const denied = requireRole(c, "ADMIN");
  if (denied) return denied;

  const body = await c.req.json();
  const role = ["ADMIN", "ACCOUNTING", "VIEWER", "EMPLOYEE"].includes(String(body.role))
    ? String(body.role) as UserRole
    : "VIEWER";
  const password = String(body.password || "");
  const user = await prisma.appUser.update({
    where: { id: c.req.param("id") },
    data: {
      email: String(body.email),
      name: String(body.name || body.email),
      role,
      employeeId: body.employeeId || null,
      isActive: body.isActive !== false,
      ...(password ? { passwordHash: hashPassword(password) } : {})
    },
    include: { employee: true }
  });
  return c.json(publicUser(user));
});

api.delete("/users/:id", async (c) => {
  const denied = requireRole(c, "ADMIN");
  if (denied) return denied;
  if (c.req.param("id") === currentUser(c).id) {
    return c.json({ message: "自分自身は停止できません" }, 400);
  }

  const user = await prisma.appUser.update({
    where: { id: c.req.param("id") },
    data: { isActive: false },
    include: { employee: true }
  });
  return c.json(publicUser(user));
});

api.get("/settings", async (c) => {
  const currentFiscalYear = new Date().getFullYear();
  const settings = await prisma.companySetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", currentFiscalYear }
  });
  return c.json(settings);
});

api.put("/settings", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json();
  const healthInsuranceRate = Number(body.healthInsuranceRate ?? Number(body.socialInsuranceRate || 0) / 2);
  const pensionInsuranceRate = Number(body.pensionInsuranceRate ?? Number(body.socialInsuranceRate || 0) / 2);
  const childCareSupportRate = Number(body.childCareSupportRate || 0);
  const socialInsuranceRate = healthInsuranceRate + pensionInsuranceRate + childCareSupportRate;
  const settings = await prisma.companySetting.upsert({
    where: { id: "default" },
    update: {
      currentFiscalYear: Number(body.currentFiscalYear || new Date().getFullYear()),
      fiscalClosingMonth: normalizeClosingMonth(body.fiscalClosingMonth),
      overtimeRate: Number(body.overtimeRate),
      incomeTaxRate: Number(body.incomeTaxRate),
      socialInsuranceRate,
      healthInsuranceRate,
      pensionInsuranceRate,
      childCareSupportRate,
      employmentInsuranceRate: Number(body.employmentInsuranceRate)
    },
    create: {
      id: "default",
      currentFiscalYear: Number(body.currentFiscalYear || new Date().getFullYear()),
      fiscalClosingMonth: normalizeClosingMonth(body.fiscalClosingMonth),
      overtimeRate: Number(body.overtimeRate),
      incomeTaxRate: Number(body.incomeTaxRate),
      socialInsuranceRate,
      healthInsuranceRate,
      pensionInsuranceRate,
      childCareSupportRate,
      employmentInsuranceRate: Number(body.employmentInsuranceRate)
    }
  });
  return c.json(settings);
});

api.get("/ses/company-setting", async (c) => {
  const denied = requireRole(c, "VIEWER");
  if (denied) return denied;

  const settings = await prisma.companySetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", currentFiscalYear: new Date().getFullYear() }
  });
  return c.json(settings);
});

api.put("/ses/company-setting", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json();
  const settings = await prisma.companySetting.upsert({
    where: { id: "default" },
    update: {
      invoiceCompanyName: nullableText(body.invoiceCompanyName),
      invoicePostalCode: nullableText(body.invoicePostalCode),
      invoiceAddress: nullableText(body.invoiceAddress),
      invoiceTel: nullableText(body.invoiceTel),
      invoiceRegistrationNo: nullableText(body.invoiceRegistrationNo),
      invoiceBankName: nullableText(body.invoiceBankName),
      invoiceBankBranch: nullableText(body.invoiceBankBranch),
      invoiceBankAccount: nullableText(body.invoiceBankAccount),
      invoiceBankHolder: nullableText(body.invoiceBankHolder),
      fiscalClosingMonth: normalizeClosingMonth(body.fiscalClosingMonth)
    },
    create: {
      id: "default",
      currentFiscalYear: new Date().getFullYear(),
      invoiceCompanyName: nullableText(body.invoiceCompanyName),
      invoicePostalCode: nullableText(body.invoicePostalCode),
      invoiceAddress: nullableText(body.invoiceAddress),
      invoiceTel: nullableText(body.invoiceTel),
      invoiceRegistrationNo: nullableText(body.invoiceRegistrationNo),
      invoiceBankName: nullableText(body.invoiceBankName),
      invoiceBankBranch: nullableText(body.invoiceBankBranch),
      invoiceBankAccount: nullableText(body.invoiceBankAccount),
      invoiceBankHolder: nullableText(body.invoiceBankHolder),
      fiscalClosingMonth: normalizeClosingMonth(body.fiscalClosingMonth)
    }
  });
  return c.json(settings);
});

api.get("/fiscal-rates", async (c) => {
  const rates = await prisma.fiscalRate.findMany({ orderBy: { fiscalYear: "desc" } });
  return c.json(rates);
});

api.post("/fiscal-rates", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json();
  const healthInsuranceRate = Number(body.healthInsuranceRate ?? Number(body.socialInsuranceRate || 0) / 2);
  const pensionInsuranceRate = Number(body.pensionInsuranceRate ?? Number(body.socialInsuranceRate || 0) / 2);
  const childCareSupportRate = Number(body.childCareSupportRate || 0);
  const socialInsuranceRate = healthInsuranceRate + pensionInsuranceRate + childCareSupportRate;
  const rate = await prisma.fiscalRate.upsert({
    where: { fiscalYear: Number(body.fiscalYear) },
    update: {
      overtimeRate: Number(body.overtimeRate),
      incomeTaxRate: Number(body.incomeTaxRate),
      socialInsuranceRate,
      healthInsuranceRate,
      pensionInsuranceRate,
      childCareSupportRate,
      employmentInsuranceRate: Number(body.employmentInsuranceRate),
      memo: body.memo || null
    },
    create: {
      fiscalYear: Number(body.fiscalYear),
      overtimeRate: Number(body.overtimeRate),
      incomeTaxRate: Number(body.incomeTaxRate),
      socialInsuranceRate,
      healthInsuranceRate,
      pensionInsuranceRate,
      childCareSupportRate,
      employmentInsuranceRate: Number(body.employmentInsuranceRate),
      memo: body.memo || null
    }
  });
  return c.json(rate);
});

api.get("/income-tax-brackets", async (c) => {
  const fiscalYear = Number(c.req.query("fiscalYear") || new Date().getFullYear());
  const brackets = await prisma.incomeTaxBracket.findMany({
    where: { fiscalYear },
    orderBy: [{ dependentCount: "asc" }, { minTaxable: "asc" }]
  });
  return c.json(brackets);
});

api.post("/income-tax-brackets/import", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json<{ csv?: string }>();
  const rows = parseCsv(body.csv || "");
  const data = rows.map((row) => ({
    fiscalYear: Number(row.fiscalYear),
    dependentCount: Number(row.dependentCount || 0),
    minTaxable: Number(row.minTaxable || 0),
    maxTaxable: row.maxTaxable ? Number(row.maxTaxable) : null,
    taxAmount: Number(row.taxAmount || 0)
  })).filter((row) => row.fiscalYear && row.minTaxable >= 0 && row.taxAmount >= 0);

  if (!data.length) return c.json({ message: "No valid income tax rows" }, 400);

  const fiscalYears = [...new Set(data.map((row) => row.fiscalYear))];
  await prisma.$transaction([
    prisma.incomeTaxBracket.deleteMany({ where: { fiscalYear: { in: fiscalYears } } }),
    prisma.incomeTaxBracket.createMany({ data })
  ]);
  return c.json({ imported: data.length, fiscalYears });
});

api.get("/employees", async (c) => {
  const q = c.req.query("q") || "";
  const user = currentUser(c);
  const employees = await prisma.employee.findMany({
    where: {
      isActive: true,
      id: user.role === "EMPLOYEE" ? user.employeeId || "__none__" : undefined,
      OR: q ? [{ name: { contains: q, mode: "insensitive" } }, { employeeNo: { contains: q, mode: "insensitive" } }] : undefined
    },
    orderBy: { employeeNo: "asc" }
  });
  return c.json(employees);
});

api.get("/customers", async (c) => {
  const denied = requireRole(c, "VIEWER");
  if (denied) return denied;

  const q = c.req.query("q") || "";
  const customers = await prisma.customer.findMany({
    where: {
      isActive: true,
      OR: q ? [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { contactName: { contains: q, mode: "insensitive" } }
      ] : undefined
    },
    orderBy: [{ name: "asc" }]
  });
  return c.json(customers);
});

api.post("/customers", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json();
  const name = String(body.name || "").trim();
  if (!name) return c.json({ message: "取引先名を入力してください" }, 400);

  const customer = await prisma.customer.create({
    data: {
      name,
      code: nullableText(body.code),
      contactName: nullableText(body.contactName),
      email: nullableText(body.email),
      phone: nullableText(body.phone),
      postalCode: nullableText(body.postalCode),
      address: nullableText(body.address),
      invoiceNumber: nullableText(body.invoiceNumber),
      isSoleProprietor: body.isSoleProprietor === true,
      closingDay: nullableInt(body.closingDay),
      paymentSiteDays: nullableInt(body.paymentSiteDays),
      memo: nullableText(body.memo)
    }
  });
  return c.json(customer, 201);
});

api.put("/customers/:id", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json();
  const name = String(body.name || "").trim();
  if (!name) return c.json({ message: "取引先名を入力してください" }, 400);

  const customer = await prisma.customer.update({
    where: { id: c.req.param("id") },
    data: {
      name,
      code: nullableText(body.code),
      contactName: nullableText(body.contactName),
      email: nullableText(body.email),
      phone: nullableText(body.phone),
      postalCode: nullableText(body.postalCode),
      address: nullableText(body.address),
      invoiceNumber: nullableText(body.invoiceNumber),
      isSoleProprietor: body.isSoleProprietor === true,
      closingDay: nullableInt(body.closingDay),
      paymentSiteDays: nullableInt(body.paymentSiteDays),
      memo: nullableText(body.memo)
    }
  });
  return c.json(customer);
});

api.delete("/customers/:id", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  await prisma.customer.update({ where: { id: c.req.param("id") }, data: { isActive: false } });
  return c.json({ ok: true });
});

api.get("/ses/external-members", async (c) => {
  const denied = requireRole(c, "VIEWER");
  if (denied) return denied;

  const q = c.req.query("q") || "";
  const members = await prisma.sesExternalMember.findMany({
    where: {
      isActive: true,
      OR: q ? [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } }
      ] : undefined
    },
    include: { customer: true },
    orderBy: [{ name: "asc" }]
  });
  return c.json(members);
});

api.post("/ses/external-members", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json();
  const name = String(body.name || "").trim();
  const customerId = nullableText(body.customerId);
  if (!name) return c.json({ message: "外部メンバー名を入力してください" }, 400);
  if (!customerId) return c.json({ message: "所属会社を選択してください" }, 400);

  const member = await prisma.sesExternalMember.create({
    data: {
      customerId,
      name,
      code: nullableText(body.code),
      email: nullableText(body.email),
      phone: nullableText(body.phone),
      memo: nullableText(body.memo)
    },
    include: { customer: true }
  });
  return c.json(member, 201);
});

api.get("/ses/contracts", async (c) => {
  const denied = requireRole(c, "VIEWER");
  if (denied) return denied;

  const q = c.req.query("q") || "";
  const contracts = await prisma.sesContract.findMany({
    where: {
      isActive: true,
      OR: q ? [
        { title: { contains: q, mode: "insensitive" } },
        { contractNo: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } }
      ] : undefined
    },
    include: {
      customer: true,
      members: {
        include: { employee: true, externalMember: { include: { customer: true } } },
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: [{ updatedAt: "desc" }]
  });
  return c.json(contracts);
});

function contractMemberData(member: Record<string, unknown>) {
  const source = member.source === "EXTERNAL" ? "EXTERNAL" : "EMPLOYEE";
  const employeeId = source === "EMPLOYEE" ? nullableText(member.employeeId) : null;
  const externalMemberId = source === "EXTERNAL" ? nullableText(member.externalMemberId) : null;
  if (source === "EMPLOYEE" && !employeeId) throw new Error("社員メンバーを選択してください");
  if (source === "EXTERNAL" && !externalMemberId) throw new Error("別会社の従業員を選択してください");

  return {
    source,
    employeeId,
    externalMemberId,
    billingType: member.billingType === "HOURLY" ? "HOURLY" : member.billingType === "TIME_RANGE" ? "TIME_RANGE" : "FIXED",
    itemDescription: nullableText(member.itemDescription),
    unitPrice: numberOrDefault(member.unitPrice, 0),
    lowerLimitHours: nullableDecimal(member.lowerLimitHours),
    upperLimitHours: nullableDecimal(member.upperLimitHours),
    deductionHourlyRate: numberOrDefault(member.deductionHourlyRate, 0),
    excessHourlyRate: numberOrDefault(member.excessHourlyRate, 0),
    startDate: nullableText(member.startDate),
    endDate: nullableText(member.endDate),
    memo: nullableText(member.memo)
  };
}

api.post("/ses/contracts", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json();
  const customerId = nullableText(body.customerId);
  const title = String(body.title || "").trim();
  if (!customerId) return c.json({ message: "取引先を選択してください" }, 400);
  if (!title) return c.json({ message: "契約名を入力してください" }, 400);
  const contractType = body.contractType === "PURCHASE" ? "PURCHASE" : "SALES";

  try {
    const members = Array.isArray(body.members) ? body.members.map(contractMemberData) : [];
    const contract = await prisma.sesContract.create({
      data: {
        customerId,
        contractType,
        contractNo: nullableText(body.contractNo),
        title,
        startDate: nullableText(body.startDate),
        endDate: nullableText(body.endDate),
        memo: nullableText(body.memo),
        members: { create: members }
      },
      include: {
        customer: true,
        members: { include: { employee: true, externalMember: { include: { customer: true } } } }
      }
    });
    return c.json(contract, 201);
  } catch (error) {
    return c.json({ message: error instanceof Error ? error.message : "契約を保存できませんでした" }, 400);
  }
});

api.put("/ses/contracts/:id", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json();
  const customerId = nullableText(body.customerId);
  const title = String(body.title || "").trim();
  if (!customerId) return c.json({ message: "取引先を選択してください" }, 400);
  if (!title) return c.json({ message: "契約名を入力してください" }, 400);
  const contractType = body.contractType === "PURCHASE" ? "PURCHASE" : "SALES";

  try {
    const members = Array.isArray(body.members) ? body.members.map(contractMemberData) : [];
    const contract = await prisma.$transaction(async (tx) => {
      await tx.sesContractMember.deleteMany({ where: { contractId: c.req.param("id") } });
      return tx.sesContract.update({
        where: { id: c.req.param("id") },
        data: {
          customerId,
          contractType,
          contractNo: nullableText(body.contractNo),
          title,
          startDate: nullableText(body.startDate),
          endDate: nullableText(body.endDate),
          memo: nullableText(body.memo),
          members: { create: members }
        },
        include: {
          customer: true,
          members: { include: { employee: true, externalMember: { include: { customer: true } } } }
        }
      });
    });
    return c.json(contract);
  } catch (error) {
    return c.json({ message: error instanceof Error ? error.message : "契約を保存できませんでした" }, 400);
  }
});

api.delete("/ses/contracts/:id", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  await prisma.sesContract.update({ where: { id: c.req.param("id") }, data: { isActive: false } });
  return c.json({ ok: true });
});

api.get("/ses/revenues", async (c) => {
  const denied = requireRole(c, "VIEWER");
  if (denied) return denied;

  const settings = await prisma.companySetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", currentFiscalYear: new Date().getFullYear() }
  });
  const closingMonth = normalizeClosingMonth(c.req.query("closingMonth") || settings.fiscalClosingMonth);
  const fiscalYear = Number(c.req.query("fiscalYear") || settings.currentFiscalYear || fiscalYearFromDateByClosingMonth(new Date(), closingMonth));
  const q = c.req.query("q") || "";
  const { startPeriod, endPeriod } = fiscalPeriodRange(fiscalYear, closingMonth);
  const periods = monthPeriods(startPeriod, endPeriod);
  const [revenues, expenses, partnerCosts, invoices, payrolls, bonuses] = await Promise.all([
    prisma.sesRevenue.findMany({
      where: {
        isActive: true,
        period: { gte: startPeriod, lte: endPeriod },
        OR: q ? [
          { title: { contains: q, mode: "insensitive" } },
          { memo: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
          { contract: { title: { contains: q, mode: "insensitive" } } },
          { employee: { name: { contains: q, mode: "insensitive" } } },
          { externalMember: { name: { contains: q, mode: "insensitive" } } }
        ] : undefined
      },
      include: {
        customer: true,
        contract: true,
        employee: true,
        externalMember: { include: { customer: true } }
      },
      orderBy: [{ period: "asc" }, { updatedAt: "desc" }]
    }),
    prisma.sesExpense.findMany({
      where: {
        isActive: true,
        period: { gte: startPeriod, lte: endPeriod },
        OR: q ? [
          { title: { contains: q, mode: "insensitive" } },
          { memo: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
          { contract: { title: { contains: q, mode: "insensitive" } } },
          { employee: { name: { contains: q, mode: "insensitive" } } },
          { externalMember: { name: { contains: q, mode: "insensitive" } } }
        ] : undefined
      },
      include: {
        customer: true,
        contract: true,
        employee: true,
        externalMember: { include: { customer: true } }
      },
      orderBy: [{ period: "asc" }, { updatedAt: "desc" }]
    }),
    prisma.sesPartnerCost.findMany({
      where: { isActive: true, period: { gte: startPeriod, lte: endPeriod } },
      include: {
        customer: true,
        contract: true,
        contractMember: true,
        employee: true,
        externalMember: { include: { customer: true } }
      },
      orderBy: [{ period: "asc" }, { updatedAt: "desc" }]
    }),
    prisma.sesInvoice.findMany({
      where: { isActive: true, period: { gte: startPeriod, lte: endPeriod } },
      select: { period: true, totalAmount: true }
    }),
    prisma.payroll.findMany({
      where: { period: { gte: startPeriod, lte: endPeriod } },
      select: { period: true, grossPay: true, socialInsurance: true }
    }),
    prisma.bonus.findMany({
      where: { period: { gte: startPeriod, lte: endPeriod } },
      select: { period: true, bonusAmount: true, socialInsurance: true }
    })
  ]);
  const monthlyTotals = periods.map((period) => {
    const invoiceRevenueAmount = invoices.filter((invoice) => invoice.period === period).reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const individualRevenueAmount = revenues.filter((revenue) => revenue.period === period).reduce((sum, revenue) => sum + revenue.amount, 0);
    const payrollAmount = payrolls.filter((payroll) => payroll.period === period).reduce((sum, payroll) => sum + payroll.grossPay, 0);
    const bonusAmount = bonuses.filter((bonus) => bonus.period === period).reduce((sum, bonus) => sum + bonus.bonusAmount, 0);
    const payrollSocialAmount = payrolls.filter((payroll) => payroll.period === period).reduce((sum, payroll) => sum + payroll.socialInsurance, 0);
    const bonusSocialAmount = bonuses.filter((bonus) => bonus.period === period).reduce((sum, bonus) => sum + bonus.socialInsurance, 0);
    const socialInsuranceAmount = payrollSocialAmount + bonusSocialAmount;
    const partnerCostAmount = partnerCosts.filter((cost) => cost.period === period).reduce((sum, cost) => sum + cost.amount, 0);
    const individualExpenseAmount = expenses.filter((expense) => expense.period === period).reduce((sum, expense) => sum + expense.amount, 0);
    const revenueAmount = invoiceRevenueAmount + individualRevenueAmount;
    const expenseAmount = payrollAmount + bonusAmount + socialInsuranceAmount + partnerCostAmount + individualExpenseAmount;
    return {
      period,
      amount: revenueAmount,
      revenueAmount,
      invoiceRevenueAmount,
      individualRevenueAmount,
      expenseAmount,
      payrollAmount,
      bonusAmount,
      socialInsuranceAmount,
      partnerCostAmount,
      individualExpenseAmount,
      profitAmount: revenueAmount - expenseAmount
    };
  });
  return c.json({
    fiscalYear,
    closingMonth,
    startPeriod,
    endPeriod,
    totalAmount: monthlyTotals.reduce((sum, row) => sum + row.revenueAmount, 0),
    totalRevenueAmount: monthlyTotals.reduce((sum, row) => sum + row.revenueAmount, 0),
    totalExpenseAmount: monthlyTotals.reduce((sum, row) => sum + row.expenseAmount, 0),
    totalProfitAmount: monthlyTotals.reduce((sum, row) => sum + row.profitAmount, 0),
    monthlyTotals,
    revenues,
    expenses,
    partnerCosts
  });
});

async function revenueData(body: Record<string, unknown>) {
  const period = String(body.period || "");
  const title = String(body.title || "").trim();
  const amount = numberOrDefault(body.amount, 0);
  const contractId = nullableText(body.contractId);
  const employeeId = nullableText(body.employeeId);
  const externalMemberId = nullableText(body.externalMemberId);
  if (!isPeriod(period)) throw new Error("売上月を指定してください");
  if (!title) throw new Error("売上名を入力してください");
  if (!employeeId && !externalMemberId) throw new Error("社員または外部メンバーを選択してください");

  let customerId = nullableText(body.customerId);
  if (contractId) {
    const contract = await prisma.sesContract.findUnique({ where: { id: contractId }, select: { customerId: true } });
    customerId = contract?.customerId || customerId;
  }

  return {
    period,
    customerId,
    contractId,
    employeeId,
    externalMemberId,
    title,
    amount,
    memo: nullableText(body.memo)
  };
}

api.post("/ses/revenues", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  try {
    const body = await c.req.json();
    const revenue = await prisma.sesRevenue.create({
      data: await revenueData(body),
      include: {
        customer: true,
        contract: true,
        employee: true,
        externalMember: { include: { customer: true } }
      }
    });
    return c.json(revenue, 201);
  } catch (error) {
    return c.json({ message: error instanceof Error ? error.message : "売上を保存できませんでした" }, 400);
  }
});

api.put("/ses/revenues/:id", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  try {
    const body = await c.req.json();
    const revenue = await prisma.sesRevenue.update({
      where: { id: c.req.param("id") },
      data: await revenueData(body),
      include: {
        customer: true,
        contract: true,
        employee: true,
        externalMember: { include: { customer: true } }
      }
    });
    return c.json(revenue);
  } catch (error) {
    return c.json({ message: error instanceof Error ? error.message : "売上を保存できませんでした" }, 400);
  }
});

api.delete("/ses/revenues/:id", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  await prisma.sesRevenue.update({ where: { id: c.req.param("id") }, data: { isActive: false } });
  return c.json({ ok: true });
});

async function expenseData(body: Record<string, unknown>) {
  const period = String(body.period || "");
  const title = String(body.title || "").trim();
  const amount = numberOrDefault(body.amount, 0);
  const contractId = nullableText(body.contractId);
  if (!isPeriod(period)) throw new Error("支出月を指定してください");
  if (!title) throw new Error("支出名を入力してください");

  let customerId = nullableText(body.customerId);
  if (contractId) {
    const contract = await prisma.sesContract.findUnique({ where: { id: contractId }, select: { customerId: true } });
    customerId = contract?.customerId || customerId;
  }

  return {
    period,
    customerId,
    contractId,
    employeeId: nullableText(body.employeeId),
    externalMemberId: nullableText(body.externalMemberId),
    title,
    amount,
    memo: nullableText(body.memo)
  };
}

api.post("/ses/expenses", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  try {
    const body = await c.req.json();
    const expense = await prisma.sesExpense.create({
      data: await expenseData(body),
      include: {
        customer: true,
        contract: true,
        employee: true,
        externalMember: { include: { customer: true } }
      }
    });
    return c.json(expense, 201);
  } catch (error) {
    return c.json({ message: error instanceof Error ? error.message : "支出を保存できませんでした" }, 400);
  }
});

api.put("/ses/expenses/:id", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  try {
    const body = await c.req.json();
    const expense = await prisma.sesExpense.update({
      where: { id: c.req.param("id") },
      data: await expenseData(body),
      include: {
        customer: true,
        contract: true,
        employee: true,
        externalMember: { include: { customer: true } }
      }
    });
    return c.json(expense);
  } catch (error) {
    return c.json({ message: error instanceof Error ? error.message : "支出を保存できませんでした" }, 400);
  }
});

api.delete("/ses/expenses/:id", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  await prisma.sesExpense.update({ where: { id: c.req.param("id") }, data: { isActive: false } });
  return c.json({ ok: true });
});

api.get("/ses/partner-costs", async (c) => {
  const denied = requireRole(c, "VIEWER");
  if (denied) return denied;

  const period = c.req.query("period") || previousYearMonthServer();
  if (!isPeriod(period)) return c.json({ message: "外注費対象月を指定してください" }, 400);
  const contracts = await prisma.sesContract.findMany({
    where: {
      isActive: true,
      contractType: "PURCHASE",
      OR: [{ startDate: null }, { startDate: { lte: `${period}-31` } }],
      AND: [{ OR: [{ endDate: null }, { endDate: { gte: `${period}-01` } }] }]
    },
    include: {
      customer: true,
      members: {
        include: { employee: true, externalMember: { include: { customer: true } } },
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: [{ updatedAt: "desc" }]
  });
  const costs = await prisma.sesPartnerCost.findMany({
    where: { isActive: true, period },
    include: {
      customer: true,
      contract: true,
      contractMember: true,
      employee: true,
      externalMember: { include: { customer: true } }
    },
    orderBy: [{ updatedAt: "desc" }]
  });
  return c.json({ period, contracts, costs });
});

function previousYearMonthServer() {
  const { year, month } = tokyoDateParts();
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

function partnerCostTitle(member: {
  itemDescription?: string | null;
  employee?: { name: string } | null;
  externalMember?: { name: string; customer?: { name: string } | null } | null;
  source: string;
}) {
  if (member.itemDescription) return member.itemDescription;
  if (member.source === "EMPLOYEE") return member.employee?.name || "社員作業費";
  const company = member.externalMember?.customer?.name;
  const name = member.externalMember?.name || "外部メンバー作業費";
  return company ? `${company} ${name}` : name;
}

api.post("/ses/partner-costs", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json();
  const period = String(body.period || "");
  if (!isPeriod(period)) return c.json({ message: "外注費対象月を指定してください" }, 400);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return c.json({ message: "外注費明細がありません" }, 400);

  const saved = [];
  for (const item of items) {
    const contractMemberId = nullableText(item.contractMemberId);
    const amount = numberOrDefault(item.amount, 0);
    if (!contractMemberId) continue;
    const member = await prisma.sesContractMember.findUnique({
      where: { id: contractMemberId },
      include: {
        contract: true,
        employee: true,
        externalMember: { include: { customer: true } }
      }
    });
    if (!member || !member.contract.isActive || member.contract.contractType !== "PURCHASE") continue;
    const data = {
      period,
      customerId: member.contract.customerId,
      contractId: member.contractId,
      contractMemberId: member.id,
      employeeId: member.employeeId,
      externalMemberId: member.externalMemberId,
      title: nullableText(item.title) || partnerCostTitle(member),
      amount,
      memo: nullableText(item.memo)
    };
    const existing = await prisma.sesPartnerCost.findFirst({
      where: { isActive: true, period, contractMemberId: member.id }
    });
    saved.push(existing
      ? await prisma.sesPartnerCost.update({ where: { id: existing.id }, data })
      : await prisma.sesPartnerCost.create({ data })
    );
  }
  return c.json({ saved: saved.length });
});

api.get("/ses/invoices", async (c) => {
  const denied = requireRole(c, "VIEWER");
  if (denied) return denied;

  const q = c.req.query("q") || "";
  const period = c.req.query("period") || "";
  const invoices = await prisma.sesInvoice.findMany({
    where: {
      isActive: true,
      period: period || undefined,
      OR: q ? [
        { title: { contains: q, mode: "insensitive" } },
        { invoiceNo: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { contract: { title: { contains: q, mode: "insensitive" } } }
      ] : undefined
    },
    include: { customer: true, contract: true, items: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ issueDate: "desc" }, { updatedAt: "desc" }]
  });
  return c.json(invoices);
});

function memberDisplayName(member: { source: string; employee?: { name: string } | null; externalMember?: { name: string; customer?: { name: string } | null } | null }) {
  if (member.source === "EMPLOYEE") return member.employee?.name || "社員未設定";
  const company = member.externalMember?.customer?.name;
  const name = member.externalMember?.name || "外部メンバー未設定";
  return company ? `${company} ${name}` : name;
}

function invoiceItemFromContractMember(member: {
  id: string;
  billingType: string;
  itemDescription?: string | null;
  unitPrice: number;
  lowerLimitHours?: unknown;
  upperLimitHours?: unknown;
  deductionHourlyRate: number;
  excessHourlyRate: number;
  employee?: { name: string } | null;
  externalMember?: { name: string; customer?: { name: string } | null } | null;
  source: string;
}, workHoursByMember: Record<string, unknown>) {
  const range = member.billingType === "TIME_RANGE"
    ? `（${member.lowerLimitHours ?? "-"}-${member.upperLimitHours ?? "-"}h）`
    : "";
  const description = member.itemDescription || `${memberDisplayName(member)} 作業費${range}`;
  if (member.billingType === "HOURLY") {
    const rawWorkHours = workHoursByMember[member.id];
    if (rawWorkHours === undefined || rawWorkHours === null || rawWorkHours === "") {
      throw new Error(`${description} の作業時間を入力してください`);
    }
    const workHours = Number(rawWorkHours);
    if (!Number.isFinite(workHours)) throw new Error(`${description} の作業時間が不正です`);

    const standardHours = member.upperLimitHours == null ? null : Number(member.upperLimitHours);
    const hourlyRate = Number(member.unitPrice || 0);
    const overtimeRate = Number(member.excessHourlyRate || hourlyRate);
    const normalHours = standardHours === null ? workHours : Math.min(workHours, standardHours);
    const overtimeHours = standardHours === null ? 0 : Math.max(0, Number((workHours - standardHours).toFixed(2)));
    const items = [{
      description: `${description} 時給（${workHours}h）`,
      quantity: Number(normalHours.toFixed(2)),
      unit: "時間",
      unitPrice: hourlyRate,
      amount: Math.round(normalHours * hourlyRate)
    }];
    if (overtimeHours > 0) {
      items.push({
        description: `${description} 時給超過（${workHours}h / 営業時間${standardHours}h）`,
        quantity: overtimeHours,
        unit: "時間",
        unitPrice: overtimeRate,
        amount: Math.round(overtimeHours * overtimeRate)
      });
    }
    return items;
  }

  const amount = Number(member.unitPrice || 0);
  const items = [{
    description,
    quantity: 1,
    unit: "人月",
    unitPrice: amount,
    amount
  }];

  if (member.billingType !== "TIME_RANGE") return items;

  const rawWorkHours = workHoursByMember[member.id];
  if (rawWorkHours === undefined || rawWorkHours === null || rawWorkHours === "") {
    throw new Error(`${description} の作業時間を入力してください`);
  }
  const workHours = Number(rawWorkHours);
  if (!Number.isFinite(workHours)) throw new Error(`${description} の作業時間が不正です`);

  const lowerLimitHours = member.lowerLimitHours == null ? null : Number(member.lowerLimitHours);
  const upperLimitHours = member.upperLimitHours == null ? null : Number(member.upperLimitHours);
  if (lowerLimitHours !== null && workHours < lowerLimitHours) {
    const shortageHours = Number((lowerLimitHours - workHours).toFixed(2));
    const unitPrice = Number(member.deductionHourlyRate || 0);
    items.push({
      description: `${description} 控除（${workHours}h / 下限${lowerLimitHours}h）`,
      quantity: shortageHours,
      unit: "時間",
      unitPrice: -unitPrice,
      amount: -Math.round(shortageHours * unitPrice)
    });
  }
  if (upperLimitHours !== null && workHours > upperLimitHours) {
    const excessHours = Number((workHours - upperLimitHours).toFixed(2));
    const unitPrice = Number(member.excessHourlyRate || 0);
    items.push({
      description: `${description} 超過（${workHours}h / 上限${upperLimitHours}h）`,
      quantity: excessHours,
      unit: "時間",
      unitPrice,
      amount: Math.round(excessHours * unitPrice)
    });
  }
  return items;
}

async function nextSesInvoiceNo(period: string) {
  const prefix = `${periodForFile(period)}-`;
  const invoices = await prisma.sesInvoice.findMany({
    where: {
      period,
      invoiceNo: { startsWith: prefix }
    },
    select: { invoiceNo: true }
  });
  const maxNo = invoices.reduce((max, invoice) => {
    const suffix = invoice.invoiceNo?.slice(prefix.length) || "";
    const number = /^\d{3}$/.test(suffix) ? Number(suffix) : 0;
    return Math.max(max, number);
  }, 0);
  return `${prefix}${String(maxNo + 1).padStart(3, "0")}`;
}

api.post("/ses/invoices/generate", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json();
  const contractId = nullableText(body.contractId);
  const period = String(body.period || "");
  if (!contractId) return c.json({ message: "契約を選択してください" }, 400);
  if (!isPeriod(period)) return c.json({ message: "請求対象月を指定してください" }, 400);

  const contract = await prisma.sesContract.findUnique({
    where: { id: contractId },
    include: {
      customer: true,
      members: { include: { employee: true, externalMember: { include: { customer: true } } }, orderBy: { createdAt: "asc" } }
    }
  });
  if (!contract || !contract.isActive) return c.json({ message: "契約が見つかりません" }, 404);
  if (contract.contractType !== "SALES") return c.json({ message: "請求書は請求契約から作成してください" }, 400);

  const existingInvoice = await prisma.sesInvoice.findFirst({
    where: { contractId, period, isActive: true },
    select: { invoiceNo: true }
  });
  if (existingInvoice) {
    return c.json({ message: `同じ契約・同じ月の請求書は作成済みです（${existingInvoice.invoiceNo || "番号なし"}）` }, 409);
  }

  const issueDate = nullableText(body.issueDate) || todayIso();
  const dueDate = nullableText(body.dueDate) || addDaysIso(endOfMonthIso(period), contract.customer.paymentSiteDays || 30);
  const workHoursByMember = (body.workHoursByMember || {}) as Record<string, unknown>;
  let items: ReturnType<typeof invoiceItemFromContractMember>[number][];
  try {
    items = contract.members.flatMap((member) => invoiceItemFromContractMember(member, workHoursByMember));
  } catch (error) {
    return c.json({ message: error instanceof Error ? error.message : "請求明細を作成できませんでした" }, 400);
  }
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const taxRate = numberOrDefault(body.taxRate, 0.1);
  const taxAmount = Math.round(subtotal * taxRate);
  const totalAmount = subtotal + taxAmount;
  const invoiceNo = nullableText(body.invoiceNo) || await nextSesInvoiceNo(period);
  const title = nullableText(body.title) || `${period} ${contract.title}`;

  try {
    const invoice = await prisma.sesInvoice.create({
      data: {
        customerId: contract.customerId,
        contractId: contract.id,
        period,
        invoiceNo,
        issueDate,
        dueDate,
        title,
        subtotal,
        taxRate,
        taxAmount,
        totalAmount,
        note: nullableText(body.note),
        items: { create: items }
      },
      include: { customer: true, contract: true, items: { orderBy: { createdAt: "asc" } } }
    });
    return c.json(invoice, 201);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return c.json({ message: "同じ契約・同じ月の請求書は作成済みです" }, 409);
    }
    throw error;
  }
});

api.delete("/ses/invoices/:id", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  await prisma.sesInvoice.update({ where: { id: c.req.param("id") }, data: { isActive: false } });
  return c.json({ ok: true });
});

api.get("/ses/invoices/:id/pdf", async (c) => {
  const denied = requireRole(c, "VIEWER");
  if (denied) return denied;

  const invoice = await prisma.sesInvoice.findUnique({
    where: { id: c.req.param("id") },
    include: { customer: true, items: { orderBy: { createdAt: "asc" } } }
  });
  if (!invoice || !invoice.isActive) return c.json({ message: "請求書が見つかりません" }, 404);
  const settings = await prisma.companySetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", currentFiscalYear: new Date().getFullYear() }
  });

  const pdf = await createInvoicePdf({
    invoiceNo: invoice.invoiceNo,
    period: invoice.period,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    title: invoice.title,
    customerName: invoice.customer.name,
    customerAddress: invoice.customer.address,
    customerInvoiceNumber: invoice.customer.invoiceNumber,
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    note: invoice.note,
    companyName: settings.invoiceCompanyName,
    companyPostalCode: settings.invoicePostalCode,
    companyAddress: settings.invoiceAddress,
    companyTel: settings.invoiceTel,
    companyRegistrationNo: settings.invoiceRegistrationNo,
    bankName: settings.invoiceBankName,
    bankBranch: settings.invoiceBankBranch,
    bankAccount: settings.invoiceBankAccount,
    bankHolder: settings.invoiceBankHolder,
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPrice: item.unitPrice,
      amount: item.amount
    }))
  });
  const customerName = safeFilePart(invoice.customer.name);
  const fileName = `請求書_${customerName}_${periodForFile(invoice.period)}.pdf`;
  const fallbackFileName = `invoice-${periodForFile(invoice.period)}-${safeFilePart(invoice.customer.id)}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentDisposition(fileName, fallbackFileName)
    }
  });
});

api.post("/employees", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json();
  const employee = await prisma.employee.create({
    data: {
      employeeNo: String(body.employeeNo),
      name: String(body.name),
      position: nullableText(body.position),
      email: body.email || null,
      defaultDependentCount: Number(body.defaultDependentCount || 0),
      employmentInsuranceEnrolled: body.employmentInsuranceEnrolled !== false,
      payType: body.payType === "HOURLY" ? "HOURLY" : "MONTHLY",
      basePay: Number(body.basePay || 0),
      fixedOvertimeAllowance: Number(body.fixedOvertimeAllowance || 0),
      memo: body.memo || null
    }
  });
  return c.json(employee, 201);
});

api.put("/employees/:id", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json();
  const employee = await prisma.employee.update({
    where: { id: c.req.param("id") },
    data: {
      employeeNo: String(body.employeeNo),
      name: String(body.name),
      position: nullableText(body.position),
      email: body.email || null,
      defaultDependentCount: Number(body.defaultDependentCount || 0),
      employmentInsuranceEnrolled: body.employmentInsuranceEnrolled !== false,
      payType: body.payType === "HOURLY" ? "HOURLY" : "MONTHLY",
      basePay: Number(body.basePay || 0),
      fixedOvertimeAllowance: Number(body.fixedOvertimeAllowance || 0),
      memo: body.memo || null
    }
  });
  return c.json(employee);
});

api.delete("/employees/:id", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  await prisma.employee.update({ where: { id: c.req.param("id") }, data: { isActive: false } });
  return c.json({ ok: true });
});

api.get("/payrolls", async (c) => {
  const period = c.req.query("period");
  const employeeId = readableEmployeeId(c, c.req.query("employeeId"));
  const q = c.req.query("q") || "";
  const payrolls = await prisma.payroll.findMany({
    where: {
      period: period || undefined,
      employeeId: employeeId || undefined,
      employee: q ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { employeeNo: { contains: q, mode: "insensitive" } }
        ]
      } : undefined
    },
    include: { employee: true },
    orderBy: [{ period: "desc" }, { employee: { employeeNo: "asc" } }]
  });
  return c.json(payrolls);
});

api.get("/bonuses", async (c) => {
  const period = c.req.query("period");
  const employeeId = readableEmployeeId(c, c.req.query("employeeId"));
  const q = c.req.query("q") || "";
  const bonuses = await prisma.bonus.findMany({
    where: {
      period: period || undefined,
      employeeId: employeeId || undefined,
      employee: q ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { employeeNo: { contains: q, mode: "insensitive" } }
        ]
      } : undefined
    },
    include: { employee: true },
    orderBy: [{ period: "desc" }, { employee: { employeeNo: "asc" } }]
  });
  return c.json(bonuses);
});

api.post("/bonuses", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json();
  const period = String(body.period);
  if (!isPeriod(period)) {
    return c.json({ message: "支給月をYYYY-MM形式で指定してください" }, 400);
  }
  if (isPayrollLockedPeriod(period) && body.forceUpdate !== true) {
    return c.json({
      message: "28日以降は前月以前の賞与データを通常保存できません。強制変更を選択して保存してください。"
    }, 423);
  }

  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: String(body.employeeId) } });
  const { fiscalYear, rates } = await getRatesForPeriod(period);
  const bonusAmount = Math.max(0, Math.round(Number(body.bonusAmount || 0)));
  const incomeTaxRate = Number(body.incomeTaxRate ?? rates.incomeTaxRate);
  const healthInsuranceRate = Number(body.healthInsuranceRate ?? rates.healthInsuranceRate);
  const pensionInsuranceRate = Number(body.pensionInsuranceRate ?? rates.pensionInsuranceRate);
  const childCareSupportRate = Number(body.childCareSupportRate ?? rates.childCareSupportRate);
  const employmentInsuranceRate = Number(body.employmentInsuranceRate ?? rates.employmentInsuranceRate);
  const socialInsuranceEnrolled = body.socialInsuranceEnrolled !== false;
  const employmentInsuranceEnrolled = employee.employmentInsuranceEnrolled !== false;
  const socialInsuranceBaseAmount = body.socialInsuranceBaseAmount ? Number(body.socialInsuranceBaseAmount) : null;
  const calculated = calculateBonus({
    bonusAmount,
    incomeTaxRate,
    healthInsuranceRate,
    pensionInsuranceRate,
    childCareSupportRate,
    employmentInsuranceRate,
    socialInsuranceEnrolled,
    employmentInsuranceEnrolled,
    socialInsuranceBaseAmount: socialInsuranceBaseAmount ?? undefined
  });

  const bonus = await prisma.bonus.upsert({
    where: { employeeId_period: { employeeId: employee.id, period } },
    update: {
      bonusAmount,
      incomeTaxRate,
      healthInsuranceRate,
      pensionInsuranceRate,
      childCareSupportRate,
      employmentInsuranceRate,
      socialInsuranceEnrolled,
      employmentInsuranceEnrolled,
      socialInsuranceBaseAmount,
      fiscalYear,
      ...calculated,
      note: body.note || null
    },
    create: {
      employeeId: employee.id,
      period,
      bonusAmount,
      incomeTaxRate,
      healthInsuranceRate,
      pensionInsuranceRate,
      childCareSupportRate,
      employmentInsuranceRate,
      socialInsuranceEnrolled,
      employmentInsuranceEnrolled,
      socialInsuranceBaseAmount,
      fiscalYear,
      ...calculated,
      note: body.note || null
    },
    include: { employee: true }
  });
  return c.json(bonus);
});

api.get("/bonuses/:id/pdf", async (c) => {
  try {
    const bonus = await prisma.bonus.findUniqueOrThrow({
      where: { id: c.req.param("id") },
      include: { employee: true }
    });
    if (!canAccessEmployee(c, bonus.employeeId)) {
      return c.json({ message: "権限がありません" }, 403);
    }
    const pdf = await createBonusPdf(toBonusPdfInput(bonus));
    const employeeName = safeFilePart(bonus.employee.name);
    const fileName = `賞与明細_${periodForFile(bonus.period)}_${employeeName}.pdf`;
    const fallbackFileName = `bonus-${periodForFile(bonus.period)}-${safeFilePart(bonus.employee.employeeNo)}.pdf`;

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentDisposition(fileName, fallbackFileName)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bonus PDF download failed";
    return c.json({ message }, 500);
  }
});

api.get("/payrolls/latest-template", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const employeeId = c.req.query("employeeId") || "";
  const beforePeriod = c.req.query("beforePeriod") || "";

  if (!employeeId) return c.json({ message: "社員を指定してください" }, 400);
  if (!isPeriod(beforePeriod)) return c.json({ message: "対象月をYYYY-MM形式で指定してください" }, 400);

  const payroll = await prisma.payroll.findFirst({
    where: {
      employeeId,
      period: { lt: beforePeriod }
    },
    include: { employee: true },
    orderBy: { period: "desc" }
  });

  if (!payroll) {
    return c.json({ message: "利用できる過去の給与入力がありません" }, 404);
  }
  return c.json(payroll);
});

api.get("/payrolls/pdf-range", async (c) => {
  const denied = requireRole(c, "VIEWER");
  if (denied) return denied;
  if (currentUser(c).role === "EMPLOYEE") {
    return c.json({ message: "権限がありません" }, 403);
  }

  try {
    const startPeriod = c.req.query("startPeriod") || "";
    const endPeriod = c.req.query("endPeriod") || "";
    const employeeId = c.req.query("employeeId") || "";
    const q = c.req.query("q") || "";
    const mode = c.req.query("mode") === "single" ? "single" : "zip";
    const includeBonus = c.req.query("includeBonus") === "true";

    if (!isPeriod(startPeriod) || !isPeriod(endPeriod)) {
      return c.json({ message: "開始月と終了月をYYYY-MM形式で指定してください" }, 400);
    }
    if (startPeriod > endPeriod) {
      return c.json({ message: "開始月は終了月以前を指定してください" }, 400);
    }

    const employeeFilter = q ? {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { employeeNo: { contains: q, mode: "insensitive" as const } }
      ]
    } : undefined;

    const payrolls = await prisma.payroll.findMany({
      where: {
        period: { gte: startPeriod, lte: endPeriod },
        employeeId: employeeId || undefined,
        employee: employeeFilter
      },
      include: { employee: true },
      orderBy: [{ period: "asc" }, { employee: { employeeNo: "asc" } }]
    });

    const bonuses = includeBonus ? await prisma.bonus.findMany({
      where: {
        period: { gte: startPeriod, lte: endPeriod },
        employeeId: employeeId || undefined,
        employee: employeeFilter
      },
      include: { employee: true },
      orderBy: [{ period: "asc" }, { employee: { employeeNo: "asc" } }]
    }) : [];

    if (!payrolls.length && !bonuses.length) {
      return c.json({ message: includeBonus ? "指定範囲の保存済み給与・賞与がありません" : "指定範囲の保存済み給与がありません" }, 404);
    }

    const filePrefix = includeBonus ? "給与賞与明細" : "給与明細";
    const fallbackPrefix = includeBonus ? "payroll-bonus-statements" : "payslips";

    if (mode === "single") {
      const merged = await PDFDocument.create();
      for (const payroll of payrolls) {
        const pdf = await createPayslipPdf(toPayslipPdfInput(payroll));
        const source = await PDFDocument.load(pdf);
        const pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      }
      for (const bonus of bonuses) {
        const pdf = await createBonusPdf(toBonusPdfInput(bonus));
        const source = await PDFDocument.load(pdf);
        const pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      }
      const mergedPdf = await merged.save();
      const fileName = `${filePrefix}_${periodForFile(startPeriod)}_${periodForFile(endPeriod)}.pdf`;
      const fallbackFileName = `${fallbackPrefix}-${periodForFile(startPeriod)}-${periodForFile(endPeriod)}.pdf`;

      return new Response(new Uint8Array(mergedPdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": attachmentDisposition(fileName, fallbackFileName)
        }
      });
    }

    const zip = new JSZip();
    for (const payroll of payrolls) {
      const pdf = await createPayslipPdf(toPayslipPdfInput(payroll));
      const employeeName = safeFilePart(payroll.employee.name);
      zip.file(`${periodForFile(payroll.period)}/給与明細_${periodForFile(payroll.period)}_${employeeName}.pdf`, pdf);
    }
    for (const bonus of bonuses) {
      const pdf = await createBonusPdf(toBonusPdfInput(bonus));
      const employeeName = safeFilePart(bonus.employee.name);
      zip.file(`${periodForFile(bonus.period)}/賞与明細_${periodForFile(bonus.period)}_${employeeName}.pdf`, pdf);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const fileName = `${filePrefix}_${periodForFile(startPeriod)}_${periodForFile(endPeriod)}.zip`;
    const fallbackFileName = `${fallbackPrefix}-${periodForFile(startPeriod)}-${periodForFile(endPeriod)}.zip`;

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": attachmentDisposition(fileName, fallbackFileName)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF range download failed";
    return c.json({ message }, 500);
  }
});

api.post("/payrolls", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json();
  const period = String(body.period);
  if (!isPeriod(period)) {
    return c.json({ message: "支給月をYYYY-MM形式で指定してください" }, 400);
  }
  if (isPayrollLockedPeriod(period) && body.forceUpdate !== true) {
    return c.json({
      message: "28日以降は前月以前の給与データを通常保存できません。強制変更を選択して保存してください。"
    }, 423);
  }
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: String(body.employeeId) } });
  const { fiscalYear, rates } = await getRatesForPeriod(period);
  const overtimeRate = Number(body.overtimeRate ?? rates.overtimeRate);
  const incomeTaxRate = Number(body.incomeTaxRate ?? rates.incomeTaxRate);
  const healthInsuranceRate = Number(body.healthInsuranceRate ?? rates.healthInsuranceRate);
  const pensionInsuranceRate = Number(body.pensionInsuranceRate ?? rates.pensionInsuranceRate);
  const childCareSupportRate = Number(body.childCareSupportRate ?? rates.childCareSupportRate);
  const socialInsuranceRate = healthInsuranceRate + pensionInsuranceRate + childCareSupportRate;
  const employmentInsuranceRate = Number(body.employmentInsuranceRate ?? rates.employmentInsuranceRate);
  const workHours = Number(body.workHours || 0);
  const overtimeHours = Number(body.overtimeHours || 0);
  const allowance = Number(body.allowance || 0);
  const fixedDeduction = Number(body.fixedDeduction || 0);
  const residentTax = Number(body.residentTax || 0);
  const dormitoryFee = Number(body.dormitoryFee || 0);
  const dependentCount = Math.max(0, Math.trunc(numberOrDefault(body.dependentCount, employee.defaultDependentCount ?? 0)));
  const socialInsuranceEnrolled = body.socialInsuranceEnrolled !== false;
  const employmentInsuranceEnrolled = employee.employmentInsuranceEnrolled !== false;
  const socialInsuranceBaseAmount = body.socialInsuranceBaseAmount ? Number(body.socialInsuranceBaseAmount) : null;
  const preliminary = calculatePayroll({
    payType: employee.payType,
    basePay: employee.basePay,
    workHours,
    overtimeHours,
    allowance,
    fixedOvertimeAllowance: employee.fixedOvertimeAllowance,
    fixedDeduction,
    overtimeRate,
    incomeTaxRate,
    healthInsuranceRate,
    pensionInsuranceRate,
    childCareSupportRate,
    employmentInsuranceRate,
    socialInsuranceEnrolled,
    employmentInsuranceEnrolled,
    socialInsuranceBaseAmount: socialInsuranceBaseAmount ?? undefined,
    residentTax,
    dormitoryFee
  });
  const taxableIncome = Math.max(preliminary.grossPay - preliminary.socialInsurance - preliminary.employmentInsurance, 0);
  const tableIncomeTax = await findIncomeTaxAmount({ fiscalYear, dependentCount, taxableIncome });
  if (tableIncomeTax.hasFiscalYearTable && tableIncomeTax.taxAmount === undefined) {
    return c.json({
      message: `${fiscalYear}年度の所得税表に、扶養人数${dependentCount}名・課税対象額${taxableIncome}円の行が見つかりません。所得税表CSVを確認してください。`
    }, 400);
  }
  const calculated = calculatePayroll({
    payType: employee.payType,
    basePay: employee.basePay,
    workHours,
    overtimeHours,
    allowance,
    fixedOvertimeAllowance: employee.fixedOvertimeAllowance,
    fixedDeduction,
    overtimeRate,
    incomeTaxRate,
    healthInsuranceRate,
    pensionInsuranceRate,
    childCareSupportRate,
    employmentInsuranceRate,
    incomeTaxAmount: tableIncomeTax.taxAmount,
    socialInsuranceEnrolled,
    employmentInsuranceEnrolled,
    socialInsuranceBaseAmount: socialInsuranceBaseAmount ?? undefined,
    residentTax,
    dormitoryFee
  });

  const payroll = await prisma.payroll.upsert({
    where: { employeeId_period: { employeeId: employee.id, period } },
    update: {
      workDays: Number(body.workDays || 0),
      workHours,
      overtimeHours,
      allowance,
      fixedDeduction,
      overtimeRate,
      incomeTaxRate,
      socialInsuranceRate,
      healthInsuranceRate,
      pensionInsuranceRate,
      childCareSupportRate,
      employmentInsuranceRate,
      socialInsuranceEnrolled,
      employmentInsuranceEnrolled,
      socialInsuranceBaseAmount,
      fiscalYear,
      dependentCount,
      taxableIncome,
      ...calculated,
      note: body.note || null
    },
    create: {
      employeeId: employee.id,
      period,
      workDays: Number(body.workDays || 0),
      workHours,
      overtimeHours,
      allowance,
      fixedDeduction,
      overtimeRate,
      incomeTaxRate,
      socialInsuranceRate,
      healthInsuranceRate,
      pensionInsuranceRate,
      childCareSupportRate,
      employmentInsuranceRate,
      socialInsuranceEnrolled,
      employmentInsuranceEnrolled,
      socialInsuranceBaseAmount,
      fiscalYear,
      dependentCount,
      taxableIncome,
      ...calculated,
      note: body.note || null
    },
    include: { employee: true }
  });
  return c.json(payroll);
});

api.get("/payrolls/:id/pdf", async (c) => {
  try {
    const payroll = await prisma.payroll.findUniqueOrThrow({
      where: { id: c.req.param("id") },
      include: { employee: true }
    });
    if (!canAccessEmployee(c, payroll.employeeId)) {
      return c.json({ message: "権限がありません" }, 403);
    }
    const pdf = await createPayslipPdf(toPayslipPdfInput(payroll));
    const employeeName = safeFilePart(payroll.employee.name);
    const fileName = `給与明細_${periodForFile(payroll.period)}_${employeeName}.pdf`;
    const fallbackFileName = `payslip-${periodForFile(payroll.period)}-${safeFilePart(payroll.employee.employeeNo)}.pdf`;

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentDisposition(fileName, fallbackFileName)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF download failed";
    return c.json({ message }, 500);
  }
});

api.post("/payrolls/:id/email", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  try {
    const payroll = await prisma.payroll.findUniqueOrThrow({
      where: { id: c.req.param("id") },
      include: { employee: true }
    });

    if (!payroll.employee.email) {
      return c.json({ message: "社員メールアドレスが未設定です" }, 400);
    }

    const pdf = await createPayslipPdf(toPayslipPdfInput(payroll));

    await sendPayslipMail({
      to: payroll.employee.email,
      employeeName: payroll.employee.name,
      period: payroll.period,
      pdf
    });

    const updated = await prisma.payroll.update({
      where: { id: payroll.id },
      data: { emailedAt: new Date() },
      include: { employee: true }
    });
    return c.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "メール送信に失敗しました";
    return c.json({ message }, 500);
  }
});

app.route("/api", api);
app.use("/assets/*", serveStatic({ root: "./dist" }));
app.use("/logo_rcloud.png", serveStatic({ path: "./dist/logo_rcloud.png" }));
app.use("*", serveStatic({ path: "./dist/index.html" }));

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT || 3000),
  hostname: "0.0.0.0"
});
