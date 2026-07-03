import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Employee, Payroll } from "@prisma/client";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { cookieName, createSession, requireAuth } from "./auth.js";
import { prisma } from "./db.js";
import { sendPayslipMail } from "./mailer.js";
import { createPayslipPdf } from "./pdf.js";
import { calculatePayroll } from "./payroll.js";

const app = new Hono();
const api = new Hono();

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

function safeFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
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
  const currentFiscalYear = new Date().getFullYear();
  const settings = await prisma.companySetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", currentFiscalYear }
  });
  return c.json(settings);
});

api.put("/settings", async (c) => {
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
      email: body.email || null,
      defaultDependentCount: Number(body.defaultDependentCount || 0),
      employmentInsuranceEnrolled: body.employmentInsuranceEnrolled !== false,
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
      email: body.email || null,
      defaultDependentCount: Number(body.defaultDependentCount || 0),
      employmentInsuranceEnrolled: body.employmentInsuranceEnrolled !== false,
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

api.get("/payrolls/latest-template", async (c) => {
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
  try {
    const startPeriod = c.req.query("startPeriod") || "";
    const endPeriod = c.req.query("endPeriod") || "";
    const employeeId = c.req.query("employeeId") || "";
    const q = c.req.query("q") || "";
    const mode = c.req.query("mode") === "single" ? "single" : "zip";

    if (!isPeriod(startPeriod) || !isPeriod(endPeriod)) {
      return c.json({ message: "開始月と終了月をYYYY-MM形式で指定してください" }, 400);
    }
    if (startPeriod > endPeriod) {
      return c.json({ message: "開始月は終了月以前を指定してください" }, 400);
    }

    const payrolls = await prisma.payroll.findMany({
      where: {
        period: { gte: startPeriod, lte: endPeriod },
        employeeId: employeeId || undefined,
        employee: q ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { employeeNo: { contains: q, mode: "insensitive" } }
          ]
        } : undefined
      },
      include: { employee: true },
      orderBy: [{ period: "asc" }, { employee: { employeeNo: "asc" } }]
    });

    if (!payrolls.length) {
      return c.json({ message: "指定範囲の保存済み給与がありません" }, 404);
    }

    if (mode === "single") {
      const merged = await PDFDocument.create();
      for (const payroll of payrolls) {
        const pdf = await createPayslipPdf(toPayslipPdfInput(payroll));
        const source = await PDFDocument.load(pdf);
        const pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      }
      const mergedPdf = await merged.save();
      const fileName = `payslips-${startPeriod}-${endPeriod}.pdf`;

      return new Response(new Uint8Array(mergedPdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${fileName}"`
        }
      });
    }

    const zip = new JSZip();
    for (const payroll of payrolls) {
      const pdf = await createPayslipPdf(toPayslipPdfInput(payroll));
      const employeeName = safeFilePart(payroll.employee.name);
      const employeeNo = safeFilePart(payroll.employee.employeeNo);
      zip.file(`${payroll.period}/payslip-${payroll.period}-${employeeNo}-${employeeName}.pdf`, pdf);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const fileName = `payslips-${startPeriod}-${endPeriod}.zip`;

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF range download failed";
    return c.json({ message }, 500);
  }
});

api.post("/payrolls", async (c) => {
  const body = await c.req.json();
  const period = String(body.period);
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
    const pdf = await createPayslipPdf(toPayslipPdfInput(payroll));
    const employeeName = safeFilePart(payroll.employee.name);
    const employeeNo = safeFilePart(payroll.employee.employeeNo);
    const fileName = `payslip-${payroll.period}-${employeeNo}-${employeeName}.pdf`;

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="payslip-${payroll.period}-${employeeNo}.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF download failed";
    return c.json({ message }, 500);
  }
});

api.post("/payrolls/:id/email", async (c) => {
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
app.use("*", serveStatic({ path: "./dist/index.html" }));

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT || 3000),
  hostname: "0.0.0.0"
});
