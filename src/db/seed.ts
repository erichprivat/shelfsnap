import { eq } from "drizzle-orm";
import { db } from ".";
import { user } from "./schema";
import { upsertBook } from "@/domain/catalogue";
import { addCopy, lendCopy } from "@/domain/copies";
import { createLocation, locationTree } from "@/domain/locations";
import { setStatus, updateReadThrough, readThroughsFor } from "@/domain/reading";
import { addToList, createList } from "@/domain/lists";

/** Development only: fills a user's library with a believable collection. Usage: bun run src/db/seed.ts you@example.com */
const email = process.argv[2];
if (!email) throw new Error("Pass the email of an existing user");
const me = await db.query.user.findFirst({ where: eq(user.email, email) });
if (!me) throw new Error(`No user ${email} — sign in once first`);

type Seed = [title: string, author: string, pages: number, year: number, shelf: string | null, status?: "read" | "reading" | "want_to_read" | "dnf", rating?: number];

const BOOKS: Seed[] = [
  ["Middlemarch", "George Eliot", 880, 1871, "Shelf 1", "read", 10],
  ["Anna Karenina", "Leo Tolstoy", 864, 1878, "Shelf 1", "read", 9],
  ["Moby-Dick", "Herman Melville", 720, 1851, "Shelf 1", "dnf"],
  ["Jane Eyre", "Charlotte Brontë", 532, 1847, "Shelf 1", "read", 8],
  ["Wuthering Heights", "Emily Brontë", 416, 1847, "Shelf 1"],
  ["Great Expectations", "Charles Dickens", 544, 1861, "Shelf 1", "read", 7],
  ["The Brothers Karamazov", "Fyodor Dostoevsky", 824, 1880, "Shelf 1"],
  ["Madame Bovary", "Gustave Flaubert", 352, 1857, "Shelf 1", "read", 8],
  ["Sult", "Knut Hamsun", 230, 1890, "Shelf 1", "read", 9],
  ["Kristin Lavransdatter", "Sigrid Undset", 1124, 1922, "Shelf 1", "reading"],
  ["The Summer Book", "Tove Jansson", 172, 1972, "Shelf 2", "read", 10],
  ["Stoner", "John Williams", 288, 1965, "Shelf 2", "read", 10],
  ["The Remains of the Day", "Kazuo Ishiguro", 258, 1989, "Shelf 2", "read", 9],
  ["Beloved", "Toni Morrison", 324, 1987, "Shelf 2"],
  ["Austerlitz", "W. G. Sebald", 298, 2001, "Shelf 2", "read", 8],
  ["Piranesi", "Susanna Clarke", 272, 2020, "Shelf 2", "read", 9],
  ["The Left Hand of Darkness", "Ursula K. Le Guin", 304, 1969, "Shelf 2", "read", 9],
  ["Pachinko", "Min Jin Lee", 496, 2017, "Shelf 2"],
  ["Orlando", "Virginia Woolf", 333, 1928, "Shelf 2", "reading"],
  ["My Struggle: Book One", "Karl Ove Knausgård", 448, 2009, "Shelf 2", "dnf"],
  ["The Ice Palace", "Tarjei Vesaas", 176, 1963, "Shelf 2", "read", 8],
  ["Septology", "Jon Fosse", 832, 2022, "Shelf 2"],
  ["Sapiens", "Yuval Noah Harari", 464, 2011, "Desk", "read", 6],
  ["The Overstory", "Richard Powers", 512, 2018, "Desk", "reading"],
  ["Thinking, Fast and Slow", "Daniel Kahneman", 499, 2011, "Desk", "read", 7],
  ["The Structure of Scientific Revolutions", "Thomas S. Kuhn", 264, 1962, "Desk"],
  ["Gödel, Escher, Bach", "Douglas Hofstadter", 777, 1979, "Desk"],
  ["The Design of Everyday Things", "Don Norman", 368, 1988, "Desk", "read", 8],
  ["A Pattern Language", "Christopher Alexander", 1171, 1977, "Desk"],
  ["Klara and the Sun", "Kazuo Ishiguro", 320, 2021, null],
  ["The Years", "Annie Ernaux", 240, 2008, null, "read", 9],
  ["Tomorrow, and Tomorrow, and Tomorrow", "Gabrielle Zevin", 416, 2022, null],
  ["Demon Copperhead", "Barbara Kingsolver", 560, 2022, null, "want_to_read"],
];
const WISHLIST: [string, string, number, number][] = [
  ["The Passenger", "Cormac McCarthy", 384, 2022],
  ["Small Things Like These", "Claire Keegan", 128, 2021],
  ["The Books of Jacob", "Olga Tokarczuk", 992, 2014],
];

const tree = await locationTree(db, me.id);
const find = (name: string) => tree.flatMap(function walk(n): typeof tree { return [n, ...n.children.flatMap(walk)]; }).find((n) => n.name === name);
const living = find("Living room") ?? (await createLocation(db, me.id, { name: "Living room" }));
const study = find("Study") ?? (await createLocation(db, me.id, { name: "Study" }));
const places: Record<string, string> = {
  "Shelf 1": (find("Shelf 1") ?? (await createLocation(db, me.id, { name: "Shelf 1", parentId: living.id }))).id,
  "Shelf 2": (find("Shelf 2") ?? (await createLocation(db, me.id, { name: "Shelf 2", parentId: living.id }))).id,
  Desk: (find("Desk") ?? (await createLocation(db, me.id, { name: "Desk", parentId: study.id }))).id,
};

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10);
let i = 0;
const ids: Record<string, string> = {};
for (const [title, author, pages, year, shelf, status, rating] of BOOKS) {
  const { workId, editionId } = await upsertBook(db, { title, authors: [author], firstPublishYear: year, edition: { pageCount: pages, binding: "paperback" } });
  ids[title] = workId;
  const copy = await addCopy(db, me.id, { editionId, locationId: shelf ? places[shelf] : null, allowDuplicate: true }).catch(() => null);
  if (status) {
    await setStatus(db, me.id, workId, status, { date: status === "reading" ? daysAgo(10 + i) : daysAgo(20 + i * 9), now }).catch(() => {});
    if (rating) {
      const [rt] = await readThroughsFor(db, me.id, workId);
      if (rt) await updateReadThrough(db, me.id, rt.id, { rating }).catch(() => {});
    }
  }
  if (copy && title === "Stoner") await lendCopy(db, me.id, copy.id, { to: "Ingrid", on: daysAgo(40), dueBack: daysAgo(5) }).catch(() => {});
  if (copy && title === "Piranesi") await lendCopy(db, me.id, copy.id, { to: "Ola", on: daysAgo(6) }).catch(() => {});
  i++;
}
for (const [title, author, pages, year] of WISHLIST) {
  const { workId } = await upsertBook(db, { title, authors: [author], firstPublishYear: year, edition: { pageCount: pages } });
  await setStatus(db, me.id, workId, "want_to_read", { now }).catch(() => {});
  ids[title] = workId;
}
const nordic = await createList(db, me.id, { name: "Nordic winter reading", description: "Short days, long books." });
for (const t of ["Sult", "The Ice Palace", "Kristin Lavransdatter", "The Summer Book", "Septology"]) await addToList(db, me.id, nordic.id, ids[t]!).catch(() => {});
const gifts = await createList(db, me.id, { name: "To give away" });
for (const t of ["Stoner", "Piranesi", "Small Things Like These"]) await addToList(db, me.id, gifts.id, ids[t]!).catch(() => {});
console.log(`Seeded ${BOOKS.length + WISHLIST.length} books for ${email}`);
