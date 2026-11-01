"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { searchBooksAction, type FoundBook } from "@/app/actions/books";
import { addToListAction, deleteListAction, moveInListAction, removeFromListAction, shareListAction, unshareListAction, updateListAction } from "@/app/actions/lists";
import { Cover } from "@/components/cover";
import { Button, ErrorText, Input } from "@/components/ui";
import { useAction } from "@/lib/use-action";
import { plural } from "@/lib/labels";

type Item = { workId: string; title: string; authors: string[]; year: number | null; coverUrl: string | null };

export function ListEditor({ list, items }: { list: { id: string; name: string; description: string | null; shareSlug: string | null }; items: Item[] }) {
  const router = useRouter();
  const { pending, error, go } = useAction();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareUrl = list.shareSlug && typeof window !== "undefined" ? `${window.location.origin}/l/${list.shareSlug}` : null;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-5 border-b border-rule pb-6">
        {editing ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); go(() => updateListAction(list.id, { name, description }), () => setEditing(false)); }}>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 font-serif text-2xl" maxLength={80} />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What's this list for?" maxLength={1000} className="w-full rounded-[3px] border border-rule-strong bg-paper-raised p-3 text-[15px] focus:border-ink focus:outline-none" />
            <div className="flex gap-2">
              <Button size="sm" disabled={pending}>Save</Button>
              <Button size="sm" type="button" variant="quiet" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="label">List · {plural(items.length, "book")}</span>
            <h1 className="font-serif text-[2.4rem] leading-tight">{list.name}</h1>
            {list.description && <p className="max-w-xl text-[15px] text-ink-2">{list.description}</p>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          {!editing && <button className="text-ink-2 hover:text-ink" onClick={() => setEditing(true)}>Rename</button>}
          {list.shareSlug ? (
            <>
              <button
                className="text-ink-2 hover:text-ink"
                onClick={async () => {
                  if (shareUrl) await navigator.clipboard.writeText(shareUrl).catch(() => {});
                  setCopied(true);
                }}
              >
                {copied ? "Link copied" : "Copy public link"}
              </button>
              <button className="text-ink-3 hover:text-ink" disabled={pending} onClick={() => go(() => unshareListAction(list.id))}>Stop sharing</button>
            </>
          ) : (
            <button className="text-ink-2 hover:text-ink" disabled={pending} onClick={() => go(() => shareListAction(list.id))}>Share with a link</button>
          )}
          {confirmDelete ? (
            <span className="flex gap-3">
              <span className="text-ink-2">Delete this list? The books stay in your library.</span>
              <button className="font-medium text-accent" onClick={() => go(() => deleteListAction(list.id), () => router.push("/lists"))}>Delete</button>
              <button className="text-ink-3" onClick={() => setConfirmDelete(false)}>Keep</button>
            </span>
          ) : (
            <button className="text-ink-3 hover:text-accent" onClick={() => setConfirmDelete(true)}>Delete list</button>
          )}
        </div>
        <ErrorText>{error}</ErrorText>
      </header>

      {items.length > 0 && (
        <ol className="flex flex-col border-t border-rule">
          {items.map((it, i) => (
            <li key={it.workId} className="flex items-center gap-4 border-b border-rule py-3">
              <span className="num w-6 text-right font-mono text-xs text-ink-3">{i + 1}</span>
              <Link href={`/book/${it.workId}`} className="w-10 shrink-0">
                <Cover seed={it.workId} title={it.title} authors={it.authors} url={it.coverUrl} size="sm" />
              </Link>
              <Link href={`/book/${it.workId}`} className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-serif text-[17px] hover:underline">{it.title}</span>
                <span className="truncate text-sm text-ink-3">{it.authors[0]}{it.year ? ` · ${it.year}` : ""}</span>
              </Link>
              <div className="flex shrink-0 items-center gap-1 text-ink-3">
                <button aria-label="Move up" disabled={pending || i === 0} onClick={() => go(() => moveInListAction(list.id, it.workId, i >= 2 ? items[i - 2]!.workId : null))} className="h-8 w-8 rounded-[3px] hover:bg-ink/5 hover:text-ink disabled:opacity-30">↑</button>
                <button aria-label="Move down" disabled={pending || i === items.length - 1} onClick={() => go(() => moveInListAction(list.id, it.workId, items[i + 1]!.workId))} className="h-8 w-8 rounded-[3px] hover:bg-ink/5 hover:text-ink disabled:opacity-30">↓</button>
                <button aria-label={`Remove ${it.title}`} disabled={pending} onClick={() => go(() => removeFromListAction(list.id, it.workId))} className="h-8 rounded-[3px] px-2 text-[13px] hover:bg-ink/5 hover:text-accent">Remove</button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <AddToThisList listId={list.id} existing={items.map((i) => i.workId)} />
    </div>
  );
}

function AddToThisList({ listId, existing }: { listId: string; existing: string[] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="flex flex-col gap-4">
      <h2 className="label">Add a book</h2>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { setError(null); const r = await searchBooksAction(q); if (r.ok) setResults(r.data); else setError(r.error); }); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or author" className="max-w-md" />
        <Button variant="line" disabled={pending || q.trim().length < 2}>Search</Button>
      </form>
      <ErrorText>{error}</ErrorText>
      {results && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {results.map((b) => {
            const on = existing.includes(b.workId);
            return (
              <li key={b.workId}>
                <button disabled={on || pending} onClick={() => start(async () => { const r = await addToListAction(listId, b.workId); if (!r.ok) setError(r.error); })} className="flex w-full items-center gap-3 rounded-[3px] border border-rule p-2 text-left hover:border-ink disabled:opacity-50">
                  <Cover seed={b.workId} title={b.title} authors={b.authors} url={b.coverUrl} size="sm" className="w-9" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-serif">{b.title}</span>
                    <span className="truncate text-xs text-ink-3">{on ? "On this list" : b.authors[0]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
