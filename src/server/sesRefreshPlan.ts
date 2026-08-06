export type SesSubMenuKey = "customers" | "projects" | "invoices" | "masters" | "numberSettings" | "revenue" | "partnerCosts" | "profit";
export type SesRefreshKey = "customers" | "contracts" | "masterData" | "invoices" | "revenues" | "partnerCosts";

export function refreshKeysForSesSubMenu(menu: SesSubMenuKey): SesRefreshKey[] {
  if (menu === "customers") return ["customers"];
  if (menu === "projects") return ["customers", "contracts", "masterData"];
  if (menu === "invoices") return ["customers", "contracts", "invoices"];
  if (menu === "partnerCosts") return ["partnerCosts"];
  if (menu === "revenue") return ["customers", "contracts", "masterData", "revenues"];
  if (menu === "profit") return ["revenues"];
  return [];
}
