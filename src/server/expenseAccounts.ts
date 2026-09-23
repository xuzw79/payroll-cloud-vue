export type ExpenseAccountOption = {
  code: number;
  name: string;
};

export const expenseAccountOptions: ExpenseAccountOption[] = [
  { code: 4, name: "会社経費" },
  { code: 5, name: "交通費" },
  { code: 6, name: "ガソリン代" },
  { code: 7, name: "高速料金" },
  { code: 8, name: "雑費" },
  { code: 9, name: "消耗品費" },
  { code: 10, name: "事務所雑費" },
  { code: 11, name: "交際費・交流費" },
  { code: 12, name: "出張・営業費" },
  { code: 13, name: "通信費" },
  { code: 14, name: "租税公課" },
  { code: 15, name: "車維持費用" },
  { code: 16, name: "税理士报酬" },
  { code: 17, name: "医療検診" },
  { code: 18, name: "社員活動" },
  { code: 19, name: "技能研修" },
  { code: 20, name: "福利厚生" },
  { code: 21, name: "短期借入金" },
  { code: 23, name: "仕入高" },
  { code: 24, name: "給料手当" },
  { code: 25, name: "法定福利費" },
  { code: 26, name: "外注費" },
  { code: 27, name: "荷造運賃" },
  { code: 28, name: "広告宣伝費" },
  { code: 29, name: "交際費" },
  { code: 30, name: "会議費" },
  { code: 31, name: "修繕費" },
  { code: 32, name: "水道光熱費" },
  { code: 33, name: "新聞図書費" },
  { code: 34, name: "諸会費" },
  { code: 35, name: "支払手数料" },
  { code: 36, name: "地代家賃" },
  { code: 37, name: "保険料" },
  { code: 38, name: "駐車場" }
];

export type ExpenseInputRow = {
  id?: string;
  expenseDate?: string;
  accountCode?: number | null;
  amount?: number | null;
  memo?: string | null;
};

export function expenseAccountTitle(code: number) {
  return expenseAccountOptions.find((account) => account.code === code)?.name || "";
}

export function expenseRowsToSave(rows: ExpenseInputRow[]) {
  return rows
    .filter((row) => !!row.expenseDate || !!row.accountCode || !!row.amount || !!row.memo?.trim())
    .filter((row) => !!row.expenseDate && !!row.accountCode && Number(row.amount || 0) > 0)
    .map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      expenseDate: row.expenseDate || "",
      accountCode: row.accountCode ?? null,
      amount: Number(row.amount || 0),
      memo: row.memo?.trim() || ""
    }));
}
