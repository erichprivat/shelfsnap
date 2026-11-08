"use client";

import { useActionState, useState } from "react";
import { deleteAccountAction } from "@/app/actions/account";
import { Button, ErrorText, Input } from "@/components/ui";
import { plural } from "@/lib/labels";

export function DeleteAccount({ books }: { books: number }) {
  const [state, action, pending] = useActionState(deleteAccountAction, undefined);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  return (
    <section className="grid gap-3 py-7 sm:grid-cols-[13rem_1fr_auto] sm:items-start sm:gap-8">
      <h2 className="font-serif text-xl leading-tight text-accent">Delete account</h2>
      <div className="flex max-w-lg flex-col gap-4 text-[15px] text-ink-2">
        <p>
          Removes {books ? plural(books, "book") : "your library"}, your shelves, lists, reading history, shelf photos and sign-in
          details, straight away. This can&apos;t be undone, so download your library first if you might want it back.
        </p>
        {open && (
          <form action={action} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="label">Type delete to confirm</span>
              <Input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus className="max-w-60" />
            </label>
            <ErrorText>{state && !state.ok ? state.error : null}</ErrorText>
            <div className="flex gap-2">
              <Button variant="accent" disabled={pending || typed.trim().toLowerCase() !== "delete"}>
                {pending ? "Deleting…" : "Delete everything"}
              </Button>
              <Button type="button" variant="quiet" onClick={() => setOpen(false)} disabled={pending}>
                Keep my account
              </Button>
            </div>
          </form>
        )}
      </div>
      {!open && (
        <div className="flex shrink-0 sm:justify-end">
          <Button variant="line" onClick={() => setOpen(true)}>
            Delete account…
          </Button>
        </div>
      )}
    </section>
  );
}
