export function tokyoTodayIso(date = new Date()) {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export function tokyoCurrentYearMonth(date = new Date()) {
  return tokyoTodayIso(date).slice(0, 7);
}

export function previousYearMonth(value = tokyoCurrentYearMonth()) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return tokyoCurrentYearMonth();
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}
