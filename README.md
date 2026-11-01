# Shelfsnap

Your library, beautifully. Snap your shelf and it's catalogued.

The product spec lives in [docs/spec.md](docs/spec.md). This is the v0.1 MVP from §3: sign-in, Goodreads/StoryGraph
import, shelf snap, barcode/search, rooms and shelves, lending, reading status with history, and lists.

## Run it

```bash
bun install
cp .env.example .env.local   # set BETTER_AUTH_SECRET (openssl rand -hex 32)
bun run db:migrate
bun run dev
```

Sign in with any email. Without `RESEND_API_KEY` the sign-in link appears on the "check your inbox" page.
Without `ANTHROPIC_API_KEY`, shelf snap runs in a labelled demo mode that returns the same sample shelf for any photo.

To exercise matching and review on a real shelf without an API key, replay a recorded reading:

```bash
SPINE_READER_FIXTURE=fixtures/img-2859.json bun run dev
```

`fixtures/img-2859.json` is a 14-book shelf (tilted spines, German/English/Italian titles, a half-hidden book) that
matches 14/14 against live Open Library.

To fill an account with a believable collection for design work:

```bash
bun run src/db/seed.ts you@example.com
```

## Checks

```bash
bun run test        # domain logic: catalogue, import, snap matching, reading, lending, lists
bun run typecheck
bun run lint
```

## Shape of the code

| Path | What's there |
| --- | --- |
| `src/domain/` | All business rules, framework-free and tested. Ownership (copies) and reading (status + read-throughs) are separate axes. |
| `src/sources/` | Open Library catalogue client and the Claude spine reader. |
| `src/app/actions/` | Server actions: auth check, call the domain, revalidate. |
| `src/app/(app)/` | Signed-in screens. `src/components/` holds the spine, cover and bookplate primitives. |
| `src/db/` | Drizzle schema (SQLite/libSQL), migrations in `drizzle/`, dev seed. |

Stack: Next.js 16 · React 19 · Tailwind 4 · Drizzle + libSQL · Better Auth (magic link, Google, Apple) · Claude Opus 5.5 vision.
