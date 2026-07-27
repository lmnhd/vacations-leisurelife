export interface AgeAtSailingResult {
  age: number;
  birthDateIso: string;
  sailingDateIso: string;
}

function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function calculateAgeAtSailing(
  birthDateIso: string,
  sailingDateIso: string
): AgeAtSailingResult {
  const birth = parseDateOnly(birthDateIso);
  const sailing = parseDateOnly(sailingDateIso);
  if (!birth || !sailing) throw new Error("Birth and sailing dates must use valid YYYY-MM-DD values");

  let age = sailing.year - birth.year;
  if (
    sailing.month < birth.month ||
    (sailing.month === birth.month && sailing.day < birth.day)
  ) {
    age -= 1;
  }
  if (age < 0 || age > 120) throw new Error("Calculated sailing age is outside the supported range");
  return { age, birthDateIso, sailingDateIso };
}
