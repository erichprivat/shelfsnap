import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date());

// ─── Auth (shape required by better-auth) ────────────────────────────────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  favoriteGenres: text("favorite_genres", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  onboardedAt: integer("onboarded_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ─── Shared catalogue ────────────────────────────────────────────────────────

export const works = sqliteTable(
  "works",
  {
    id: id(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    authors: text("authors", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    firstPublishYear: integer("first_publish_year"),
    subjects: text("subjects", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    openLibraryKey: text("open_library_key").unique(),
    // Lowercased, diacritic-free "title|first author" used to dedupe works without a source key.
    matchKey: text("match_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("works_match_key_idx").on(t.matchKey)],
);

export const editions = sqliteTable(
  "editions",
  {
    id: id(),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    isbn13: text("isbn13").unique(),
    title: text("title").notNull(),
    publisher: text("publisher"),
    publishYear: integer("publish_year"),
    pageCount: integer("page_count"),
    language: text("language"),
    binding: text("binding", { enum: ["hardcover", "paperback", "ebook", "audio", "unknown"] })
      .notNull()
      .default("unknown"),
    coverUrl: text("cover_url"),
    openLibraryKey: text("open_library_key").unique(),
    createdAt: createdAt(),
  },
  (t) => [index("editions_work_idx").on(t.workId)],
);

// ─── Per-user library ────────────────────────────────────────────────────────

export const locations = sqliteTable(
  "locations",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnySQLiteColumn => locations.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    sortOrder: real("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("locations_user_idx").on(t.userId, t.parentId)],
);

export const copyFormats = ["physical", "ebook", "audio"] as const;
export type CopyFormat = (typeof copyFormats)[number];

export const copies = sqliteTable(
  "copies",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    editionId: text("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "restrict" }),
    format: text("format", { enum: copyFormats }).notNull().default("physical"),
    locationId: text("location_id").references(() => locations.id, { onDelete: "set null" }),
    position: real("position").notNull().default(0),
    condition: text("condition", { enum: ["new", "fine", "good", "worn", "poor"] }),
    acquiredAt: text("acquired_at"),
    notes: text("notes"),
    lentTo: text("lent_to"),
    lentAt: text("lent_at"),
    dueBackAt: text("due_back_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("copies_user_idx").on(t.userId), index("copies_location_idx").on(t.locationId, t.position)],
);

export const readingStatuses = ["want_to_read", "reading", "paused", "read", "dnf"] as const;
export type ReadingStatus = (typeof readingStatuses)[number];

export const readingStatus = sqliteTable(
  "reading_status",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    status: text("status", { enum: readingStatuses }).notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.workId] })],
);

export const readThroughs = sqliteTable(
  "read_throughs",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    editionId: text("edition_id").references(() => editions.id, { onDelete: "set null" }),
    outcome: text("outcome", { enum: ["in_progress", "finished", "dnf"] }).notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    // Half-star units: 1 = ½★ … 10 = 5★.
    rating: integer("rating"),
    review: text("review"),
    createdAt: createdAt(),
  },
  (t) => [index("read_throughs_user_work_idx").on(t.userId, t.workId)],
);

export const lists = sqliteTable(
  "lists",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    shareSlug: text("share_slug").unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("lists_user_idx").on(t.userId)],
);

export const listItems = sqliteTable(
  "list_items",
  {
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    position: real("position").notNull(),
    note: text("note"),
    addedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.workId] })],
);

// ─── Shelf snap ──────────────────────────────────────────────────────────────

export const snapSessions = sqliteTable(
  "snap_sessions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    locationId: text("location_id").references(() => locations.id, { onDelete: "set null" }),
    imagePath: text("image_path").notNull(),
    status: text("status", { enum: ["processing", "ready", "failed", "committed"] }).notNull(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("snap_sessions_user_idx").on(t.userId)],
);

export type SpineCandidate = { editionId: string; score: number };
export type BoundingBox = { x: number; y: number; w: number; h: number };

export const snapSpines = sqliteTable(
  "snap_spines",
  {
    id: id(),
    sessionId: text("session_id")
      .notNull()
      .references(() => snapSessions.id, { onDelete: "cascade" }),
    // Left-to-right order on the shelf.
    ordinal: integer("ordinal").notNull(),
    rawText: text("raw_text").notNull(),
    box: text("box", { mode: "json" }).$type<BoundingBox | null>(),
    state: text("state", {
      enum: ["matched", "ambiguous", "unmatched", "duplicate", "confirmed", "rejected"],
    }).notNull(),
    candidates: text("candidates", { mode: "json" }).$type<SpineCandidate[]>().notNull().default(sql`'[]'`),
    chosenEditionId: text("chosen_edition_id").references(() => editions.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("snap_spines_order_idx").on(t.sessionId, t.ordinal)],
);

// ─── Import provenance (makes re-imports idempotent) ─────────────────────────

export const importRecords = sqliteTable(
  "import_records",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["goodreads", "storygraph"] }).notNull(),
    externalId: text("external_id").notNull(),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    importedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.source, t.externalId] })],
);

// ─── Relations ───────────────────────────────────────────────────────────────

export const worksRelations = relations(works, ({ many }) => ({
  editions: many(editions),
  readThroughs: many(readThroughs),
}));

export const editionsRelations = relations(editions, ({ one, many }) => ({
  work: one(works, { fields: [editions.workId], references: [works.id] }),
  copies: many(copies),
}));

export const copiesRelations = relations(copies, ({ one }) => ({
  edition: one(editions, { fields: [copies.editionId], references: [editions.id] }),
  location: one(locations, { fields: [copies.locationId], references: [locations.id] }),
}));

export const locationsRelations = relations(locations, ({ one, many }) => ({
  parent: one(locations, { fields: [locations.parentId], references: [locations.id], relationName: "parent" }),
  children: many(locations, { relationName: "parent" }),
  copies: many(copies),
}));

export const readThroughsRelations = relations(readThroughs, ({ one }) => ({
  work: one(works, { fields: [readThroughs.workId], references: [works.id] }),
  edition: one(editions, { fields: [readThroughs.editionId], references: [editions.id] }),
}));

export const listsRelations = relations(lists, ({ many }) => ({
  items: many(listItems),
}));

export const listItemsRelations = relations(listItems, ({ one }) => ({
  list: one(lists, { fields: [listItems.listId], references: [lists.id] }),
  work: one(works, { fields: [listItems.workId], references: [works.id] }),
}));

export const snapSessionsRelations = relations(snapSessions, ({ one, many }) => ({
  spines: many(snapSpines),
  location: one(locations, { fields: [snapSessions.locationId], references: [locations.id] }),
}));

export const snapSpinesRelations = relations(snapSpines, ({ one }) => ({
  session: one(snapSessions, { fields: [snapSpines.sessionId], references: [snapSessions.id] }),
  chosenEdition: one(editions, { fields: [snapSpines.chosenEditionId], references: [editions.id] }),
}));
