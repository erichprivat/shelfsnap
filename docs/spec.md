# Shelfsnap — Product Spec v0

_Status: draft · Owner: Thilo · Last updated: 2026-11-01_

## 1. Thesis

Heavy readers own hundreds of books, and no tool makes that library feel like *theirs*. Goodreads,
StoryGraph and Hardcover are built around reading logs; ownership is an afterthought. The tools that
do track ownership (LibraryThing, Libib, CLZ Books) look like spreadsheets.

**Shelfsnap: your library, beautifully. Snap your shelf, and it's catalogued.**

Cataloguing a physical collection becomes near-effortless (photo, barcode, import). Reading status,
lists and challenges layer on top to keep people coming back. Community comes last, once there is
density.

### Target user (v1)

Heavy reader, 25–45, reads 30+ books a year, owns a physical collection they care about, and
already uses Goodreads or StoryGraph without loving it.

### Not the target (yet)

Casual readers (fewer than 10 books a year), ebook/audio-only readers, libraries and institutions.

### Principles

1. **Onboarding in under 2 minutes.** Importing and snapping come before any profile setup.
2. **Mobile-first capture, desktop-friendly browsing.** The camera is on the phone, and the
   library is a joy on any screen.
3. **Every state change is one tap.**
4. **The shelf is the hero.** Design starts from the shelf view, not a feed.
5. **No social features until there's density.** An empty community is worse than none.

## 2. Data model

Ownership and reading are separate axes. Never mix them into a single "status".

| Entity            | Description                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| **Work**          | The abstract book ("Dune"): title, authors, original language, genres                             |
| **Edition**       | A specific ISBN: language, format, publisher, year, page count, cover                            |
| **Copy**          | A copy the user owns: edition, format (physical/ebook/audio), location, acquired date, condition, lent to |
| **Location**      | User-defined hierarchy: Home → Living room → Shelf 3. Copies live in a location.                  |
| **ReadingStatus** | Per user per Work: `want_to_read · reading · paused · read · dnf`                                 |
| **ReadThrough**   | One read: start/end dates, edition, rating, review. Supports re-reads.                            |
| **List**          | User-curated and ordered. Can include Works the user doesn't own.                                 |
| **Challenge**     | Rules + time window + progress (see §6)                                                           |
| **SnapSession**   | One shelf photo: image, detected spines, match candidates, confirmation state                    |

Views are queries, not states. Examples:

- "Want to read, but don't own": `status = want_to_read AND no Copy`
- "Owned but unread": `has Copy AND status ∉ {read, dnf}`
- "Lent out": `Copy.lent_to IS NOT NULL`

## 3. Scope

### MVP (v0.1): target 6–8 weeks

1. **Auth:** email magic link or passkey, Google, Apple. Use a provider (Clerk, Supabase Auth or
   Auth0); don't build it.
2. **Onboarding:** Goodreads + StoryGraph CSV import first, then genre picks. Imported "owned"
   shelves become Copies; everything else becomes ReadingStatus.
3. **Add books:**
   - **Shelf snap (core):** photo → spine detection → matched candidates → confirm/review queue.
   - **Barcode scan:** ISBN, the reliable fallback.
   - **Search:** title/author/ISBN.
4. **Library:**
   - Shelf view (spines/covers, grouped by Location), plus grid and list.
   - Full-text search; filter by ownership × reading status × format × genre × location.
   - Book detail: Work info, your Copies, reading status, ReadThroughs.
5. **Locations:** create rooms/shelves, move books between them, "where is my copy of X?"
6. **Lending:** mark a Copy as lent (to a name), with a due-back nudge.
7. **Lists:** create, reorder, share by public link.

### v0.2: retention layer

- **Challenges:** yearly goal + book bingo (§6).
- **Year in review:** books read, pages, genres, ratings, a drag-and-drop tier list, and image
  export.
- **Shelf re-snap:** photograph a shelf again to detect new and missing books.

### v1: capture beyond physical, light social

- Ebook import: Kindle (parse the "Your Content" export or the notebook page), Kobo (local device
  SQLite), Apple Books (local SQLite on Mac), Libby (timeline export).
- Friends + activity feed (finished a book, completed a bingo row).
- **Club-lite:** a shared list + shared challenge with friends.

### Later / not now

- Clubs with discussion forums (moderation burden, needs density)
- Exploration/editorial page (prizes, articles): only if it can run without editors, e.g. on
  Wikidata + RSS
- Colour/interest themes
- Public reviews as SEO content
- Recommendations beyond genre matching

## 4. Shelf snap: feature spec

**Flow:** take or upload a photo → detect spines → for each spine, OCR the title/author fragments →
match against the catalogue → show results overlaid on the photo → user confirms.

**Acceptance criteria**

- A photo of one shelf (~30 spines) returns results in under 15 s.
- Each detected spine is one of: ✅ confident match, ❓ candidates to pick from, or ⚠️ unmatched
  (tap to search or scan a barcode).
- Confirming all confident matches takes one tap.
- Confirmed books become Copies in the chosen Location, ordered as they stand on the shelf.
- Duplicates (you already own this Edition) are flagged, not added silently.
- Target: ≥70% of spines matched confidently on a well-lit photo. Treat this as a measured metric,
  not a promise.

**Risks:** stylised fonts, vertical text, glare, partly hidden spines and non-Latin scripts. Edition
matching from a spine is often ambiguous, so default to the most common edition in the user's
language and let them change it.

**Tech direction:** a vision LLM for spine reading + catalogue search for matching. Keep the photo
so the user can re-run detection or correct it later.

## 5. Onboarding: feature spec

1. Sign up (social or magic link).
2. "Bring your books": import a CSV, snap a shelf, or scan a barcode. Skip is allowed but
   discouraged.
3. Pick 3+ genres.
4. Land on your shelf, already populated.

**Activation target:** ≥50 books in the library after the first session.

## 6. Challenge engine (v0.2)

A challenge is a **time window + goal + criteria**.

- **Count:** N books / pages in a window (calendar year, custom dates, rolling).
- **Bingo:** an N×N card. Each cell is a predicate, for example:
  - `genre = fantasy`
  - `published < 1950`
  - `author_country ≠ home_country`
  - `pages > 600`
  - `translated = true`
  - `owned_for > 2 years` (the shelf-of-shame cell: a physical-first twist)
  - free text with a self-attest checkbox
- Cards are randomly generated from a pool or hand-built, and shareable as templates.
- A finished ReadThrough is matched against open challenges automatically; the user can reassign
  which cell it counts for.
- Badges come from completing challenges, not from arbitrary actions.

## 7. Book data sources

| Source                             | Use                                                         | Watch out                                                  |
| ---------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| **Open Library**                   | Core catalogue: work→edition model, covers, bulk dumps      | Patchy data quality; use the dumps and cache covers rather than hammering the API |
| **Google Books API**               | Filling gaps, multilingual coverage                         | Low-res covers, daily quota, ToS limits on caching         |
| **ISBNdb**                         | Edition coverage                                            | Paid                                                       |
| **Wikidata**                       | Literary prizes, author nationality (bingo predicates)      | SPARQL queries take some effort                            |
| **Bokbasen / Nasjonalbiblioteket** | Norwegian/Nordic editions                                   | Bokbasen is commercial                                     |
| **Hardcover API**                  | Reference only                                              | A direct competitor; don't depend on it                    |

**Approach:** import the Open Library dumps into our own database as the core catalogue, enrich on
demand from Google Books / ISBNdb, and keep our own cover cache. The Goodreads API has been closed
since 2020. Verify current pricing and terms before committing to any of these.

## 8. Business model (direction, to decide)

- **Premium tier** (StoryGraph Plus has proven this works): unlimited snaps, advanced stats,
  custom challenge templates, library export/insurance report.
- **Affiliate:** "buy" links to Bookshop.org / local bookstores for want-to-read books you don't
  own.
- Snaps cost real inference money, so the free tier needs a cap.

## 9. Success metrics

- **Activation:** ≥50 books catalogued in the first session
- **Snap quality:** % of spines matched confidently; % of matches corrected by users
- **Retention:** week-4 and week-12 active
- **Library growth:** books added per active user per month

## 10. Open decisions

1. Web-first (fast to prototype in Claude Design) or native mobile first (camera, barcode)?
   Leaning toward a mobile-web PWA for the MVP.
2. Business model: premium vs affiliate as the primary model.
3. Name check: Shelfsnap domain, trademark and app-store availability.
4. Stack (to decide with the first technical design).

## 11. First design pass (Claude Design)

1. Onboarding / import
2. Shelf snap: camera → results overlay → review queue
3. Library shelf view (by Location)
4. Book detail (Work + Copies + reading status)
5. Lists
