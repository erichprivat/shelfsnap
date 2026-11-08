import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { OpenLibrarySource } from "@/sources/openlibrary";
import { defaultSpineReader } from "@/sources/spine-reader";

export const catalogueSource = new OpenLibrarySource();
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

export async function readUpload(rel: string) {
  const full = path.resolve(UPLOAD_ROOT, rel);
  if (!full.startsWith(UPLOAD_ROOT + path.sep)) throw new Error("Invalid upload path");
  return readFile(full);
}

/** Removes every photo the user uploaded. */
export async function deleteUploads(userId: string) {
  const dir = path.resolve(UPLOAD_ROOT, userId);
  if (!dir.startsWith(UPLOAD_ROOT + path.sep) || dir === UPLOAD_ROOT) throw new Error("Invalid upload path");
  await rm(dir, { recursive: true, force: true });
}
