# Readmoth

For people who own their books. Snap your shelves and Readmoth catalogues them.

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

## What snaps cost

Every model read is logged with its tokens and cost (`model_usage`). Each user gets `SNAP_MONTHLY_LIMIT` free
snaps a month (default 10); search and barcode adds are always free. See the month's spend with:

```bash
bun run usage            # this month
bun run usage 2026-11    # a given month
```

Measured on a 14-book shelf: Opus 5.5 $0.044 (14/14 matched), Sonnet 5.5 $0.022 (13/14 + 1 to check),
Haiku 5.5 $0.003 (13/14 + 2 to check, slower). Set a monthly spend limit in the Anthropic Console as a backstop.

## Readers and feedback

`/admin` shows each reader's first day (the spec's activation bar is 50 books), what they have done since, and
the latest in-app feedback. Only addresses in `ADMIN_EMAILS` can open it. Feedback is stored in the database and,
when `FEEDBACK_TO` is set, forwarded by email with the reader as reply-to. Locally:

```bash
bun run stats
```

## Limits and abuse guards

- **Invite-only beta.** With `SIGNUPS=invite` (set in `fly.toml`), only addresses in `INVITED_EMAILS` or `ADMIN_EMAILS`
  can create an account; existing readers always get in. Invite someone with
  `fly secrets set INVITED_EMAILS=a@example.com,b@example.com` (it replaces the list).
- **Snaps per reader:** `SNAP_MONTHLY_LIMIT` model reads a month. Failed reads that were billed count too.
- **Spend per day:** once all readers together pass `SNAP_DAILY_BUDGET_USD` (UTC day), snaps pause until midnight.
  Search and barcode always work. The Anthropic workspace cap is the last line behind this.
- **Not a shelf:** the read also answers whether the photo shows books; if not, the snap fails and the photo is dropped.
- **Photos** are deleted once a snap is added to the library, and after seven days if it never is (swept on boot and daily).

## Deploy (Fly.io)

One machine in Stockholm with a 3 GB volume at `/data` holding the SQLite database and snap photos awaiting review
(~$5/month; daily volume snapshots kept 5 days). Config is in `fly.toml`; migrations run on boot.

```bash
fly auth login
fly launch --no-deploy --copy-config      # first time only; keeps fly.toml, creates the app
fly volumes create shelfsnap_data --region arn --size 3
fly secrets set BETTER_AUTH_SECRET="$(openssl rand -hex 32)" ANTHROPIC_API_KEY=… RESEND_API_KEY=… EMAIL_FROM="Readmoth <hello@your-domain>"
bun run deploy                            # wakes the machine, deploys, fails if Fly ever runs a second one
```

SQLite on a volume can't be shared, so the app must run on exactly one machine; deploy through
`bun run deploy` rather than plain `fly deploy`.

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
