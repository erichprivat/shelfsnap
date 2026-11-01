import type { CopyFormat, ReadingStatus } from "@/db/schema";

export const STATUS_LABEL: Record<ReadingStatus, string> = {
  want_to_read: "Want to read",
  reading: "Reading",
  paused: "Paused",
  read: "Read",
  dnf: "Didn't finish",
};

export const FORMAT_LABEL: Record<CopyFormat, string> = { physical: "Print", ebook: "Ebook", audio: "Audiobook" };

export function formatDate(iso: string | null | undefined, opts: { year?: boolean } = {}) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(opts.year === false ? {} : { year: "numeric" }) });
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

export function stars(halfStars: number | null) {
  if (!halfStars) return null;
  return "★".repeat(Math.floor(halfStars / 2)) + (halfStars % 2 ? "½" : "");
}
