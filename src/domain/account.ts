import { desc, eq, inArray, sql } from "drizzle-orm";
import Papa from "papaparse";
import type { DbLike } from "@/db";
import {
  account,
  copies,
  feedback,
  importRecords,
  listItems,
  lists,
  locations,
  modelUsage,
  readingStatus,
  readThroughs,
  session,
  snapSessions,
  snapSpines,
  user,
  verification,
  type ReadingStatus,
} from "@/db/schema";
import { libraryItems } from "./library";

const EXCLUSIVE_SHELF: Record<ReadingStatus, string> = {
  want_to_read: "to-read",
  reading: "currently-reading",
  paused: "paused",
  read: "read",
  dnf: "did-not-finish",
};

const EXPORT_COLUMNS = [
  "Book Id", "Title", "Author", "Additional Authors", "ISBN13", "My Rating", "Binding", "Number of Pages", "Year Published",
  "Date Read", "Date Added", "Bookshelves", "Exclusive Shelf", "My Review", "Read Count", "Owned Copies",
  "Format", "Location", "Lent To", "Due Back",
] as const;

const goodreadsDate = (d: string | Date | null) => {
  if (!d) return "";
  const iso = typeof d === "string" ? d : d.toISOString().slice(0, 10);
  return iso.slice(0, 10).replaceAll("-", "/");
};

/**
 * The whole library in Goodreads' export format, so StoryGraph, Hardcover and Readmoth itself can import it.
 * Readmoth-only details (format, shelf location, lending) come last, where other importers ignore them.
 */
export async function exportLibraryCsv(db: DbLike, userId: string): Promise<string> {
  const items = await libraryItems(db, userId);
  const reads = await db.query.readThroughs.findMany({
    where: eq(readThroughs.userId, userId),
    orderBy: [desc(readThroughs.createdAt)],
  });
  const places = await db.query.locations.findMany({ where: eq(locations.userId, userId) });
  const byId = new Map(places.map((p) => [p.id, p]));
  const placePath = (id: string | null) => {
    const names: string[] = [];
    for (let p = id ? byId.get(id) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) names.unshift(p.name);
    return names.join(" › ");
  };

  const rows = items.map((item): Record<(typeof EXPORT_COLUMNS)[number], string | number> => {
    const own = reads.filter((r) => r.workId === item.workId);
    const rated = own.find((r) => r.rating !== null);
    const review = own.find((r) => r.review)?.review ?? "";
    const physical = item.copies.filter((c) => c.format === "physical");
    const first = item.copies[0];
    const shelves = [physical.length ? "owned" : null, item.copies.some((c) => c.format === "ebook") ? "ebook" : null].filter(Boolean);
    return {
      "Book Id": item.workId,
      Title: item.title,
      Author: item.authors[0] ?? "",
      "Additional Authors": item.authors.slice(1).join(", "),
      ISBN13: item.copies.find((c) => c.isbn13)?.isbn13 ?? "",
      "My Rating": rated?.rating ? Math.round(rated.rating / 2) : 0,
      Binding: first?.binding && first.binding !== "unknown" ? first.binding : "",
      "Number of Pages": item.pageCount ?? "",
      "Year Published": item.year ?? "",
      "Date Read": goodreadsDate(item.lastFinishedAt),
      "Date Added": item.addedAt ? goodreadsDate(new Date(item.addedAt)) : "",
      Bookshelves: shelves.join(", "),
      "Exclusive Shelf": item.status ? EXCLUSIVE_SHELF[item.status] : "",
      "My Review": review,
      "Read Count": own.filter((r) => r.outcome === "finished").length,
      "Owned Copies": physical.length,
      Format: [...new Set(item.copies.map((c) => c.format))].join(", "),
      Location: [...new Set(physical.map((c) => placePath(c.locationId)).filter(Boolean))].join("; "),
      "Lent To": item.copies.map((c) => c.lentTo).filter(Boolean).join("; "),
      "Due Back": item.copies.map((c) => c.dueBackAt).filter(Boolean).join("; "),
    };
  });
  return Papa.unparse({ fields: [...EXPORT_COLUMNS], data: rows.map((r) => EXPORT_COLUMNS.map((c) => r[c])) }, { newline: "\n" });
}

/**
 * Removes everything the user owns. Works and editions stay: they are the shared catalogue.
 * Deletes table by table rather than trusting cascades, which need a per-connection foreign_keys pragma.
 */
export async function deleteAccount(db: DbLike, userId: string) {
  const me = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!me) return;
  const sessionIds = db.select({ id: snapSessions.id }).from(snapSessions).where(eq(snapSessions.userId, userId));
  const listIds = db.select({ id: lists.id }).from(lists).where(eq(lists.userId, userId));
  await db.delete(snapSpines).where(inArray(snapSpines.sessionId, sessionIds));
  await db.delete(modelUsage).where(eq(modelUsage.userId, userId));
  await db.delete(feedback).where(eq(feedback.userId, userId));
  await db.delete(snapSessions).where(eq(snapSessions.userId, userId));
  await db.delete(importRecords).where(eq(importRecords.userId, userId));
  await db.delete(listItems).where(inArray(listItems.listId, listIds));
  await db.delete(lists).where(eq(lists.userId, userId));
  await db.delete(readThroughs).where(eq(readThroughs.userId, userId));
  await db.delete(readingStatus).where(eq(readingStatus.userId, userId));
  await db.delete(copies).where(eq(copies.userId, userId));
  await db.update(locations).set({ parentId: null }).where(eq(locations.userId, userId));
  await db.delete(locations).where(eq(locations.userId, userId));
  await db.delete(session).where(eq(session.userId, userId));
  await db.delete(account).where(eq(account.userId, userId));
  // Pending sign-in links keep the address inside a JSON value, keyed by token.
  await db.delete(verification).where(sql`instr(${verification.value}, ${`"email":${JSON.stringify(me.email)}`}) > 0`);
  await db.delete(user).where(eq(user.id, userId));
}
