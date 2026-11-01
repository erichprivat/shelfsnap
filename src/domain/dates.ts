import { invalid } from "./errors";

export type IsoDate = string & { readonly __brand: "IsoDate" };

/** Accepts YYYY-MM-DD or YYYY/MM/DD (Goodreads/StoryGraph); rejects impossible dates like 2023-02-30. */
export function parseDate(raw: string | null | undefined): IsoDate | null {
  if (!raw) return null;
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  if (y < 1000) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` as IsoDate;
}

export function requireDate(raw: string | null | undefined, field: string): IsoDate | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const d = parseDate(raw);
  if (!d) throw invalid(`${field} isn't a valid date`);
  return d;
}

/** Today in the user's calendar, with a day of slack so a late-evening entry in UTC+14 isn't "in the future". */
export function latestAllowedDate(now = new Date()): IsoDate {
  const t = new Date(now.getTime() + 24 * 3600 * 1000);
  return t.toISOString().slice(0, 10) as IsoDate;
}

export function todayUtc(now = new Date()): IsoDate {
  return now.toISOString().slice(0, 10) as IsoDate;
}
