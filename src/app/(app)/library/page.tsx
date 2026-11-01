import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { readingStatuses, type ReadingStatus } from "@/db/schema";
import { todayUtc } from "@/domain/dates";
import { filterLibrary, libraryItems, libraryStats, shelvesFor, type LibraryFilter, type LibraryItem } from "@/domain/library";
import { Cover } from "@/components/cover";
import { Spine } from "@/components/spine";
import { Input, LinkButton } from "@/components/ui";
import { FORMAT_LABEL, plural, STATUS_LABEL } from "@/lib/labels";
import { placeOrder, placePaths } from "@/lib/places";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Library" };

const VIEWS = ["shelves", "covers", "list"] as const;
type View = (typeof VIEWS)[number];

const FILTERS: { key: string; label: string; filter: LibraryFilter }[] = [
  { key: "all", label: "Everything", filter: {} },
  { key: "owned", label: "On my shelves", filter: { ownership: "owned" } },
  { key: "unread", label: "Owned, unread", filter: { ownership: "owned", status: "none" } },
  { key: "reading", label: "Reading", filter: { status: "reading" } },
  { key: "read", label: "Read", filter: { status: "read" } },
  { key: "wishlist", label: "Wishlist", filter: { ownership: "wishlist" } },
  { key: "lent", label: "Lent out", filter: { lent: true } },
];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const user = await requireUser();
  const sp = await searchParams;
  const view: View = VIEWS.includes(one(sp.view) as View) ? (one(sp.view) as View) : "shelves";
  const filterKey = FILTERS.some((f) => f.key === one(sp.show)) ? one(sp.show)! : "all";
  const q = one(sp.q)?.slice(0, 120) ?? "";
  const statusParam = one(sp.status);
  const status = (readingStatuses as readonly string[]).includes(statusParam ?? "") ? (statusParam as ReadingStatus) : undefined;

  const [items, places] = await Promise.all([libraryItems(db, user.id), shelvesFor(db, user.id)]);
  if (items.length === 0) return <EmptyLibrary />;

  const today = todayUtc();
  const stats = libraryStats(items, today);
  const base = FILTERS.find((f) => f.key === filterKey)!.filter;
  const shown = filterLibrary(items, { ...base, q, ...(status ? { status } : {}) }).sort((a, b) => a.title.localeCompare(b.title));
  const paths = placePaths(places);

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { view, show: filterKey, q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "view" && v === "shelves") && !(k === "show" && v === "all")) p.set(k, v);
    const s = p.toString();
    return s ? `/library?${s}` : "/library";
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-5 border-b border-rule pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="label">Library</span>
            <h1 className="font-serif text-[2.6rem] leading-none tracking-[-0.01em] sm:text-[3.2rem]">
              <span className="num">{stats.owned.toLocaleString("en")}</span> {stats.owned === 1 ? "book" : "books"}
            </h1>
          </div>
          <div className="hidden gap-2 sm:flex">
            <LinkButton href="/add" variant="line" size="sm">
              Find a book
            </LinkButton>
            <LinkButton href="/snap" variant="accent" size="sm">
              Snap a shelf
            </LinkButton>
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2">
          <Stat label="print copies" value={stats.physical} />
          {stats.digital > 0 && <Stat label="digital" value={stats.digital} />}
          {stats.unplaced > 0 && (
            <Link href={href({ show: "owned", view: "shelves" })} className="hover:text-ink">
              <Stat label="not yet shelved" value={stats.unplaced} tone="ochre" />
            </Link>
          )}
          {stats.lent > 0 && (
            <Link href={href({ show: "lent" })} className="hover:text-ink">
              <Stat label={stats.overdue ? `lent out · ${stats.overdue} overdue` : "lent out"} value={stats.lent} tone={stats.overdue ? "accent" : undefined} />
            </Link>
          )}
          <Stat label={`read in ${today.slice(0, 4)}`} value={stats.readThisYear} />
          {stats.wishlist > 0 && <Stat label="on the wishlist" value={stats.wishlist} />}
        </dl>
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <form action="/library" className="relative flex-1 sm:max-w-sm">
            {view !== "shelves" && <input type="hidden" name="view" value={view} />}
            {filterKey !== "all" && <input type="hidden" name="show" value={filterKey} />}
            <Input name="q" defaultValue={q} placeholder="Search your library" aria-label="Search your library" className="h-9 text-sm" />
          </form>
          <nav className="ml-auto flex shrink-0 gap-4 text-[13px]" aria-label="View">
            {VIEWS.map((v) => (
              <Link
                key={v}
                href={href({ view: v })}
                aria-current={v === view ? "true" : undefined}
                className="capitalize text-ink-3 underline-offset-[6px] hover:text-ink aria-[current=true]:text-ink aria-[current=true]:underline aria-[current=true]:decoration-accent aria-[current=true]:decoration-2"
              >
                {v}
              </Link>
            ))}
          </nav>
        </div>
        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Filter">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href({ show: f.key })}
              aria-current={f.key === filterKey ? "true" : undefined}
              className="shrink-0 rounded-full border border-transparent px-3 py-1 text-[13px] text-ink-2 hover:text-ink aria-[current=true]:border-ink aria-[current=true]:text-ink"
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>

      {shown.length === 0 ? (
        <p className="py-16 text-center text-ink-2">
          Nothing matches{q ? <> “{q}”</> : " this filter"}.{" "}
          <Link href="/library" className="underline underline-offset-4">
            Show everything
          </Link>
        </p>
      ) : view === "shelves" ? (
        <ShelvesView items={shown} order={placeOrder(places)} paths={paths} />
      ) : view === "covers" ? (
        <CoversView items={shown} />
      ) : (
        <ListView items={shown} paths={paths} />
      )}
    </div>
  );
}

const TONE_CLASS = { ochre: "text-ochre", accent: "text-accent" } as const;

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ochre" | "accent" }) {
  const color = tone ? TONE_CLASS[tone] : "text-ink";
  return (
    <span className="flex items-baseline gap-1.5">
      <dd className={`num font-medium ${color}`}>{value.toLocaleString("en")}</dd>
      <dt>{label}</dt>
    </span>
  );
}

type ShelfBook = { item: LibraryItem; copyId: string; position: number; lentTo: string | null; overdue: boolean };

function ShelvesView({ items, order, paths }: { items: LibraryItem[]; order: { id: string }[]; paths: Map<string, string[]> }) {
  const byShelf = new Map<string | null, ShelfBook[]>();
  const digital: LibraryItem[] = [];
  const notOwned: LibraryItem[] = [];
  for (const item of items) {
    const physical = item.copies.filter((c) => c.format === "physical");
    if (item.copies.length === 0) notOwned.push(item);
    else if (physical.length === 0) digital.push(item);
    for (const c of physical) {
      const list = byShelf.get(c.locationId) ?? [];
      list.push({ item, copyId: c.id, position: c.position, lentTo: c.lentTo, overdue: Boolean(c.lentTo && c.dueBackAt && c.dueBackAt < todayUtc()) });
      byShelf.set(c.locationId, list);
    }
  }
  const groups = [...order.map((o) => o.id), null].filter((id) => byShelf.has(id));
  return (
    <div className="flex flex-col gap-12">
      {groups.map((id) => {
        const books = byShelf.get(id)!.sort((a, b) => a.position - b.position);
        const path = id ? (paths.get(id) ?? []) : null;
        return (
          <section key={id ?? "unplaced"} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="flex items-baseline gap-2 font-serif text-xl">
                {path ? (
                  path.map((p, i) => (
                    <span key={i} className={i < path.length - 1 ? "text-ink-3" : ""}>
                      {p}
                      {i < path.length - 1 && <span className="ml-2 text-ink-3">/</span>}
                    </span>
                  ))
                ) : (
                  <span className="text-ochre">Not yet shelved</span>
                )}
              </h2>
              <span className="label num">{plural(books.length, "book")}</span>
            </div>
            <div className="relative">
              <div className="flex h-52 items-end gap-[3px] overflow-x-auto px-2 pt-3 [scrollbar-width:none] sm:h-60">
                {books.map((b) => (
                  <Spine key={b.copyId} seed={b.item.workId} title={b.item.title} authors={b.item.authors} pageCount={b.item.pageCount} href={`/book/${b.item.workId}`} lentTo={b.lentTo} overdue={b.overdue} />
                ))}
              </div>
              <div className="shelf-board" />
              <div className="shelf-shade" />
            </div>
            {!path && <p className="text-sm text-ink-3">Open a book to give it a place, or snap the shelf it stands on.</p>}
          </section>
        );
      })}
      {digital.length > 0 && <CoverStrip title="Ebooks & audiobooks" items={digital} />}
      {notOwned.length > 0 && <CoverStrip title="Tracked, not owned" items={notOwned} />}
    </div>
  );
}

function CoverStrip({ title, items }: { title: string; items: LibraryItem[] }) {
  return (
    <section className="flex flex-col gap-4 border-t border-rule pt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-xl">{title}</h2>
        <span className="label num">{plural(items.length, "book")}</span>
      </div>
      <CoversView items={items} />
    </section>
  );
}

function CoversView({ items }: { items: LibraryItem[] }) {
  return (
    <ul className="grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {items.map((item) => (
        <li key={item.workId}>
          <Link href={`/book/${item.workId}`} className="group flex flex-col gap-2.5">
            <Cover seed={item.workId} title={item.title} authors={item.authors} url={item.coverUrl} className="transition-transform duration-200 group-hover:-translate-y-1" />
            <span className="flex flex-col gap-0.5">
              <span className="line-clamp-2 font-serif text-[15px] leading-snug">{item.title}</span>
              <span className="truncate text-xs text-ink-3">{item.authors[0]}</span>
              {item.status && <span className="text-[11px] text-ink-2">{STATUS_LABEL[item.status]}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ListView({ items, paths }: { items: LibraryItem[]; paths: Map<string, string[]> }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-rule-strong">
            {["Title", "Author", "Status", "Where", "Format"].map((h) => (
              <th key={h} className="label px-4 py-2 font-semibold first:pl-4 sm:first:pl-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const where = item.copies
              .filter((c) => c.format === "physical")
              .map((c) => (c.lentTo ? `With ${c.lentTo}` : c.locationId ? (paths.get(c.locationId) ?? []).join(" / ") : "Not shelved"));
            return (
              <tr key={item.workId} className="border-b border-rule hover:bg-ink/[0.025]">
                <td className="py-2.5 pr-4 pl-4 sm:pl-0">
                  <Link href={`/book/${item.workId}`} className="font-serif text-[15px] hover:underline">
                    {item.title}
                  </Link>
                </td>
                <td className="px-4 text-ink-2">{item.authors.join(", ")}</td>
                <td className="px-4 text-ink-2">{item.status ? STATUS_LABEL[item.status] : <span className="text-ink-3">—</span>}</td>
                <td className="px-4 text-ink-2">{where.join("; ") || <span className="text-ink-3">—</span>}</td>
                <td className="px-4 text-ink-3">{[...new Set(item.copies.map((c) => FORMAT_LABEL[c.format]))].join(", ") || "Not owned"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyLibrary() {
  const options = [
    { href: "/snap", title: "Snap a shelf", body: "Take a photo of a bookshelf. We read the spines and you confirm.", cta: "Open the camera", accent: true },
    { href: "/import", title: "Import your history", body: "Bring your Goodreads or StoryGraph export — ratings, dates and all.", cta: "Upload a CSV" },
    { href: "/add", title: "Find a book", body: "Search by title or author, or type the ISBN from the back cover.", cta: "Search" },
  ];
  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-3 border-b border-rule pb-8">
        <span className="label">Library</span>
        <h1 className="font-serif text-[2.6rem] leading-none sm:text-[3.2rem]">An empty shelf</h1>
        <p className="max-w-lg text-[15px] text-ink-2">Every library starts somewhere. Pick whichever is closest to hand — you can mix all three.</p>
      </header>
      <div aria-hidden className="relative">
        <div className="flex h-40 items-end gap-[3px] px-2">
          {Array.from({ length: 18 }, (_, i) => (
            <span key={i} className="rounded-[2px] border border-dashed border-rule-strong" style={{ width: 18 + ((i * 37) % 26), height: `${70 + ((i * 53) % 30)}%` }} />
          ))}
        </div>
        <div className="shelf-board" />
      </div>
      <ol className="grid gap-px overflow-hidden border border-rule bg-rule sm:grid-cols-3">
        {options.map((o, i) => (
          <li key={o.href} className="flex flex-col gap-3 bg-paper p-6">
            <span className="font-mono text-xs text-ink-3">0{i + 1}</span>
            <h2 className="font-serif text-2xl">{o.title}</h2>
            <p className="flex-1 text-sm leading-relaxed text-ink-2">{o.body}</p>
            <LinkButton href={o.href} variant={o.accent ? "accent" : "line"} size="sm" className="self-start">
              {o.cta}
            </LinkButton>
          </li>
        ))}
      </ol>
    </div>
  );
}
