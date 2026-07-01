import { PrismaClient, PayType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.companySetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      overtimeRate: 1.25,
      incomeTaxRate: 0.03,
      socialInsuranceRate: 0.15,
      employmentInsuranceRate: 0.006
    }
  });

  const employees = [
    { employeeNo: "E001", name: "佐藤 花子", payType: PayType.MONTHLY, basePay: 280000, memo: "総務" },
    { employeeNo: "E002", name: "鈴木 一郎", payType: PayType.MONTHLY, basePay: 245000, memo: "営業" },
    { employeeNo: "E003", name: "高橋 美咲", payType: PayType.HOURLY, basePay: 1450, memo: "パート" },
    { employeeNo: "E004", name: "田中 健", payType: PayType.MONTHLY, basePay: 320000, memo: "管理" },
    { employeeNo: "E005", name: "伊藤 直子", payType: PayType.HOURLY, basePay: 1250, memo: "パート" }
  ];

  for (const employee of employees) {
    await prisma.employee.upsert({
      where: { employeeNo: employee.employeeNo },
      update: employee,
      create: employee
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
