import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { enrichPending, enrichWork, type EnrichSources } from "@/domain/enrich";
import { expireSnapPhotos } from "@/domain/snap";
import { GoogleBooksSource } from "@/sources/googlebooks";
import { OpenLibrarySource } from "@/sources/openlibrary";
import { defaultSpineReader } from "@/sources/spine-reader";

export const catalogueSource = new OpenLibrarySource();
const enrichSources: EnrichSources = { openLibrary: catalogueSource, googleBooks: new GoogleBooksSource() };
export const spineReader = defaultSpineReader();
/** Only real model reads cost money, so only they count against the monthly snap limit. */
export const snapsAreMetered = spineReader.name === "claude";

const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR ?? "data/uploads");

/** Stores an uploaded photo under the user's folder; returns a path relative to the upload root. */
export async function saveUpload(userId: string, bytes: Uint8Array, ext: string) {
  const rel = path.join(userId, `${crypto.randomUUID()}.${ext}`);
  await mkdir(path.join(UPLOAD_ROOT, userId), { recursive: true });
  await writeFile(path.join(UPLOAD_ROOT, rel), bytes);
  return rel;
}

function uploadPath(rel: string) {
  const full = path.resolve(UPLOAD_ROOT, rel);
  if (!full.startsWith(UPLOAD_ROOT + path.sep)) throw new Error("Invalid upload path");
  return full;
}

export async function readUpload(rel: string) {
  return readFile(uploadPath(rel));
}

/** Deletes photos that are no longer needed. A file that is already gone is fine. */
export async function discardUploads(rels: string[]) {
  await Promise.all(rels.map((rel) => rm(uploadPath(rel), { force: true })));
}

/** Deletes photos of snaps left unreviewed past the retention window. */
export async function sweepSnapPhotos() {
  await discardUploads(await expireSnapPhotos(db));
}

/** Removes every photo the user uploaded. */
export async function deleteUploads(userId: string) {
  const dir = path.resolve(UPLOAD_ROOT, userId);
  if (!dir.startsWith(UPLOAD_ROOT + path.sep) || dir === UPLOAD_ROOT) throw new Error("Invalid upload path");
  await rm(dir, { recursive: true, force: true });
}

let enriching: Promise<number> | null = null;

/** Fetches details for owned books that lack them. One run at a time; a call during a run joins it. */
export function enrichLibraryBooks() {
  enriching ??= enrichPending(db, enrichSources)
    .catch((e) => {
      console.error("Book details sweep failed", e);
      return 0;
    })
    .finally(() => {
      enriching = null;
    });
  return enriching;
}

/** Details for one book, e.g. when its page is opened before the sweep got to it. */
export async function enrichBook(workId: string) {
  await enrichWork(db, enrichSources, workId).catch((e) => console.error("Book details lookup failed", e));
}
