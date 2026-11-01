import { mkdirSync } from "node:fs";
import { db, migrateDb } from ".";

mkdirSync("data/uploads", { recursive: true });
await migrateDb(db);
console.log("Database is up to date");
