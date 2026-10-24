type Person = { source: "EMPLOYEE" | "EXTERNAL"; id: string };
type PersonIds = { employeeId?: string | null; externalMemberId?: string | null };
type Category = "invoice" | "revenue" | "payroll" | "bonus" | "insurance" | "partner" | "expense";
export type ProfitEntry = Partial<Person> & {
  name?: string;
  category: Category;
  amount: number;
  taxMode?: string | null;
  taxRate?: number;
  label?: string;
};
export type PersonalProfitRow = Person & {
  name: string;
  invoice: number;
  revenue: number;
  individualRevenue: number;
  payroll: number;
  bonus: number;
  insurance: number;
  partner: number;
  expense: number;
  cost: number;
  profit: number;
  margin: number | null;
};

export function resolveInvoicePerson(item: PersonIds, members: PersonIds[]): Person | null {
  if (item.employeeId && !item.externalMemberId) return { source: "EMPLOYEE", id: item.employeeId };
  if (item.externalMemberId && !item.employeeId) return { source: "EXTERNAL", id: item.externalMemberId };
  if (item.employeeId || item.externalMemberId || !members.length) return null;
  const people = members.map(member => resolveInvoicePerson(member, []));
  if (people.some(person => !person)) return null;
  const unique = new Map(people.map(person => [`${person!.source}:${person!.id}`, person!]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

export function buildPersonalProfit(entries: ProfitEntry[]) {
  const people = new Map<string, PersonalProfitRow>();
  const issues: Array<{ label: string; amount: number; reason: string }> = [];
  for (const entry of entries) {
    let amount = entry.amount;
    if (["revenue", "expense", "partner"].includes(entry.category)) {
      if (!["EXCLUSIVE", "INCLUSIVE", "EXEMPT"].includes(entry.taxMode || "")) {
        issues.push({ label: entry.label || entry.name || "", amount, reason: "税区分未設定" });
        continue;
      }
      if (entry.taxMode === "INCLUSIVE") amount = Math.round(amount / (1 + (entry.taxRate ?? 0.1)));
    }
    if (!entry.id || !entry.source) {
      issues.push({ label: entry.label || "", amount, reason: "個人未割当" });
      continue;
    }
    const key = `${entry.source}:${entry.id}`;
    let row = people.get(key);
    if (!row) {
      row = { source: entry.source, id: entry.id, name: entry.name || entry.id, invoice: 0, revenue: 0,
        individualRevenue: 0, payroll: 0, bonus: 0, insurance: 0, partner: 0, expense: 0, cost: 0, profit: 0, margin: null };
      people.set(key, row);
    }
    if (entry.category === "revenue") row.individualRevenue += amount;
    else row[entry.category] += amount;
  }
  const rows = [...people.values()].map(row => {
    row.revenue = row.invoice + row.individualRevenue;
    row.cost = row.payroll + row.bonus + row.insurance + row.partner + row.expense;
    row.profit = row.revenue - row.cost;
    row.margin = row.revenue ? row.profit / row.revenue * 100 : null;
    return row;
  }).sort((a, b) => b.profit - a.profit || a.name.localeCompare(b.name, "ja"));
  return { rows, issues, revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
    cost: rows.reduce((sum, row) => sum + row.cost, 0), profit: rows.reduce((sum, row) => sum + row.profit, 0) };
}
