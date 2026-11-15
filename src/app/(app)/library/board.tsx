"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Cover } from "@/components/cover";
import { changeStatus, StatusOptions } from "@/components/status-menu";
import type { ReadingStatus } from "@/db/schema";
import { plural } from "@/lib/labels";
import { useAction } from "@/lib/use-action";

export type BoardBook = { workId: string; title: string; author: string | null; coverUrl: string | null; status: ReadingStatus | null; readThisYear: boolean };

type Column = { key: string; label: string; drop: ReadingStatus; holds: (b: BoardBook) => boolean };

const COLUMNS: Column[] = [
  { key: "want", label: "Want to read", drop: "want_to_read", holds: (b) => b.status === null || b.status === "want_to_read" },
  { key: "reading", label: "Reading", drop: "reading", holds: (b) => b.status === "reading" },
  { key: "paused", label: "Paused", drop: "paused", holds: (b) => b.status === "paused" },
  { key: "read", label: "Read this year", drop: "read", holds: (b) => b.status === "read" && b.readThisYear },
  { key: "dnf", label: "Didn't finish", drop: "dnf", holds: (b) => b.status === "dnf" },
];

/** Drag a book between columns to change its status; tap one for the same choices as a menu (phones can't drag). */
export function ReadingBoard({ books, readEarlier, readEarlierHref }: { books: BoardBook[]; readEarlier: number; readEarlierHref: string }) {
  // Moves made here, shown at once and kept until the server's answer reloads the page.
  const [moved, setMoved] = useState<Record<string, { status: ReadingStatus | null; readThisYear: boolean }>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const { pending, error, go } = useAction();
  const current = books.map((b) => ({ ...b, ...moved[b.workId] }));

  const move = (workId: string, next: ReadingStatus | null) => {
    setMenu(null);
    const book = current.find((b) => b.workId === workId);
    if (!book || book.status === next) return;
    setMoved((m) => ({ ...m, [workId]: { status: next, readThisYear: next === "read" ? true : book.readThisYear } }));
    go(async () => {
      const res = await changeStatus(workId, next);
      if (!res.ok)
        setMoved((m) => {
          const rest = { ...m };
          delete rest[workId];
          return rest;
        });
      return res;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-3">Drag a book to another column, or tap it to choose.</p>
      {error && <p className="text-sm text-accent">{error}</p>}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 [scrollbar-width:thin]">
        {COLUMNS.map((col) => {
          const inCol = current.filter(col.holds);
          return (
            <section
              key={col.key}
              aria-label={col.label}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                setOver(col.key);
              }}
              onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragging;
                setOver(null);
                setDragging(null);
                if (id) move(id, col.drop);
              }}
              className={`flex w-60 shrink-0 snap-start flex-col gap-2 rounded-[3px] border p-2 transition-colors ${over === col.key ? "border-accent bg-accent/[0.06]" : "border-rule bg-ink/[0.02]"}`}
            >
              <h2 className="flex items-baseline justify-between px-1 pt-1">
                <span className="font-serif text-lg">{col.label}</span>
                <span className="label num">{inCol.length}</span>
              </h2>
              <ul className="flex min-h-24 flex-col gap-1.5">
                {inCol.map((b) => (
                  <BoardCard
                    key={b.workId}
                    book={b}
                    menuOpen={menu === b.workId}
                    disabled={pending}
                    onToggleMenu={() => setMenu((m) => (m === b.workId ? null : b.workId))}
                    onCloseMenu={() => setMenu(null)}
                    onPick={(s) => move(b.workId, s)}
                    onDragStart={() => setDragging(b.workId)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  />
                ))}
                {inCol.length === 0 && <li className="px-1 py-6 text-center text-xs text-ink-3">Drop a book here</li>}
              </ul>
              {col.key === "read" && readEarlier > 0 && (
                <Link href={readEarlierHref} className="px-1 text-xs text-ink-3 underline-offset-4 hover:text-ink hover:underline">
                  + {plural(readEarlier, "book")} read earlier
                </Link>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({
  book,
  menuOpen,
  disabled,
  onToggleMenu,
  onCloseMenu,
  onPick,
  onDragStart,
  onDragEnd,
}: {
  book: BoardBook;
  menuOpen: boolean;
  disabled: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onPick: (s: ReadingStatus | null) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const root = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) onCloseMenu();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen, onCloseMenu]);

  return (
    <li ref={root} className="relative">
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", book.workId);
          e.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        onClick={onToggleMenu}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="flex w-full cursor-grab items-center gap-2.5 rounded-[2px] border border-transparent bg-paper p-1.5 text-left hover:border-rule-strong active:cursor-grabbing"
      >
        <Cover seed={book.workId} title={book.title} authors={book.author ? [book.author] : []} url={book.coverUrl} size="sm" className="w-9 shrink-0" />
        <span className="flex min-w-0 flex-col">
          <span className="line-clamp-2 font-serif text-[14px] leading-snug">{book.title}</span>
          {book.author && <span className="truncate text-xs text-ink-3">{book.author}</span>}
        </span>
      </button>
      {menuOpen && (
        <div className="absolute top-full left-0 z-30 mt-1 w-full rounded-[3px] border border-rule-strong bg-paper-raised shadow-lg">
          <StatusOptions current={book.status} onPick={onPick} disabled={disabled} />
          <Link href={`/book/${book.workId}`} className="block border-t border-rule px-3 py-2 pl-[1.6rem] text-[13px] text-ink-2 hover:text-ink">
            Open book →
          </Link>
        </div>
      )}
    </li>
  );
}
