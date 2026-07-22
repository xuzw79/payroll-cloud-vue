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
  if (!name) return c.json({ message: "外部メンバー名を入力してください" }, 400);

  const member = await prisma.sesExternalMember.create({
    data: {
      customerId: nullableText(body.customerId),
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
    billingType: member.billingType === "TIME_RANGE" ? "TIME_RANGE" : "FIXED",
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

api.post("/employees", async (c) => {
  const denied = requireRole(c, "ACCOUNTING");
  if (denied) return denied;

  const body = await c.req.json();
  const employee = await prisma.employee.create({
    data: {
      employeeNo: String(body.employeeNo),
      name: String(body.name),
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
