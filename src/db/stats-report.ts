import { db } from ".";
import { ACTIVATION_BOOKS, readerStats, recentFeedback } from "@/domain/stats";

/** Usage: bun run stats — per-reader activation and the latest feedback (production: open /admin). */
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—".padEnd(10));
const readers = await readerStats(db);
const activated = readers.filter((r) => r.activated).length;
console.log("joined      last seen   day one  books  snaps  imported  feedback  reader");
for (const r of readers) {
  const n = (v: number, w: number) => String(v).padStart(w);
  console.log(`${day(r.joinedAt)}  ${day(r.lastSeenAt)}  ${n(r.booksFirstDay, 7)}  ${n(r.books, 5)}  ${n(r.snaps, 5)}  ${n(r.imported, 8)}  ${n(r.feedback, 8)}  ${r.email}${r.activated ? "  ✓" : ""}`);
}
console.log(`\n${readers.length} ${readers.length === 1 ? "reader" : "readers"} · ${activated} activated (${ACTIVATION_BOOKS}+ books on day one)`);
const notes = await recentFeedback(db, 10);
if (notes.length) console.log("\nLatest feedback:");
for (const f of notes) console.log(`\n${day(f.createdAt)}  ${f.email}${f.page ? `  ${f.page}` : ""}\n  ${f.message.replaceAll("\n", "\n  ")}`);
