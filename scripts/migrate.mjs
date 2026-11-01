// Applies pending migrations. Plain JavaScript so the production image can run it with Node, before the server starts.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const url = process.env.DATABASE_URL ?? "file:./data/shelfsnap.db";
if (url.startsWith("file:")) mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });
mkdirSync(process.env.UPLOAD_DIR ?? "data/uploads", { recursive: true });

const client = createClient({ url });
await client.execute("PRAGMA foreign_keys = ON");
await migrate(drizzle(client), { migrationsFolder: "drizzle" });
client.close();
console.log("Database is up to date");
