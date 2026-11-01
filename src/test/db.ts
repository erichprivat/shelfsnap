import { createDb, migrateDb } from "@/db";
import { user } from "@/db/schema";
import { upsertBook, type BookRecord } from "@/domain/catalogue";

export async function testDb() {
  const db = createDb(":memory:");
  await migrateDb(db);
  return db;
}

export type TestDb = Awaited<ReturnType<typeof testDb>>;

export async function makeUser(db: TestDb, name = "Reader") {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
  return id;
}

export function book(title: string, author: string, isbn?: string, extra: Partial<BookRecord> = {}): BookRecord {
  return { title, authors: [author], edition: { isbn13: (isbn as never) ?? null, binding: "paperback" }, ...extra };
}

export async function addBook(db: TestDb, title: string, author: string, isbn?: string) {
  return upsertBook(db, book(title, author, isbn));
}
