"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./logo";

const PRIMARY = [
  { href: "/library", label: "Library" },
  { href: "/lists", label: "Lists" },
  { href: "/places", label: "Rooms & shelves" },
];
const ADD = [
  { href: "/snap", label: "Snap a shelf" },
  { href: "/add", label: "Find a book" },
  { href: "/import", label: "Import" },
];

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

export function SideNav({ email, signOut }: { email: string; signOut: () => Promise<void> }) {
  const path = usePathname();
  const item = (l: { href: string; label: string }) => (
    <Link
      key={l.href}
      href={l.href}
      aria-current={isActive(path, l.href) ? "page" : undefined}
      className="relative -mx-3 rounded-[3px] px-3 py-1.5 text-[15px] text-ink-2 transition-colors hover:text-ink aria-[current=page]:text-ink aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-1.5 aria-[current=page]:before:-left-0 aria-[current=page]:before:w-[2px] aria-[current=page]:before:bg-accent"
    >
      {l.label}
    </Link>
  );
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-rule px-7 py-8 lg:flex">
      <Link href="/library" className="mb-12">
        <Wordmark />
      </Link>
      <nav className="flex flex-col gap-0.5">{PRIMARY.map(item)}</nav>
      <span className="label mt-10 mb-2">Add books</span>
      <nav className="flex flex-col gap-0.5">{ADD.map(item)}</nav>
      <div className="mt-auto flex flex-col gap-1 border-t border-rule pt-5 text-[13px]">
        <span className="truncate text-ink-3" title={email}>
          {email}
        </span>
        <form action={signOut}>
          <button className="text-ink-2 underline-offset-4 hover:text-ink hover:underline">Sign out</button>
        </form>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const path = usePathname();
  const tab = (href: string, label: string) => (
    <Link
      href={href}
      aria-current={isActive(path, href) ? "page" : undefined}
      className="flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium tracking-wide text-ink-3 aria-[current=page]:text-ink"
    >
      <span className="h-[2px] w-5 rounded-full bg-transparent [[aria-current=page]>&]:bg-accent" />
      {label}
    </Link>
  );
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-rule bg-paper/90 px-4 backdrop-blur lg:hidden">
        <Link href="/library">
          <Wordmark />
        </Link>
        <Link href="/add" className="text-sm text-ink-2">
          Find a book
        </Link>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {tab("/library", "Library")}
        {tab("/lists", "Lists")}
        <Link
          href="/snap"
          aria-label="Snap a shelf"
          className="mx-2 -mt-5 flex h-14 w-14 shrink-0 items-center justify-center self-start rounded-full bg-accent text-accent-ink shadow-book"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z" strokeLinejoin="round" />
            <circle cx="12" cy="13.2" r="3.4" />
          </svg>
        </Link>
        {tab("/places", "Shelves")}
        {tab("/import", "Import")}
      </nav>
    </>
  );
}
