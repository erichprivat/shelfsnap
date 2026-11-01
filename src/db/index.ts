import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

export function createDb(url: string) {
  const client = createClient({ url });
  return drizzle(client, { schema });
}

export async function migrateDb(db: Db) {
  await db.run("PRAGMA foreign_keys = ON");
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}

const globalForDb = globalThis as unknown as { db?: Db };

export const db = globalForDb.db ?? createDb(process.env.DATABASE_URL ?? "file:./data/shelfsnap.db");
if (process.env.NODE_ENV !== "production") globalForDb.db = db;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything that can run queries: the root handle or an open transaction. */
export type DbLike = Db | Tx;
