"use client";

import Link from "next/link";
import { useState } from "react";
import {
  addCopyAction,
  clearStatusAction,
  deleteReadAction,
  lendCopyAction,
  moveCopyAction,
  removeCopyAction,
  returnCopyAction,
  setStatusAction,
  startRereadAction,
  updateReadAction,
} from "@/app/actions/books";
import { addToListAction, createListAction, removeFromListAction } from "@/app/actions/lists";
import { Button, ErrorText, Field, Input, Select } from "@/components/ui";
import type { CopyFormat, ReadingStatus } from "@/db/schema";
import { useAction } from "@/lib/use-action";
import { formatDate, STATUS_LABEL } from "@/lib/labels";

const ORDER: ReadingStatus[] = ["want_to_read", "reading", "paused", "read", "dnf"];

export function StatusControl({ workId, status, hasReads }: { workId: string; status: ReadingStatus | null; hasReads: boolean }) {
  const { pending, error, go } = useAction();
  return (
    <div className="flex flex-col gap-2">
      <span className="label">Reading</span>
      <div role="radiogroup" aria-label="Reading status" className="flex flex-wrap gap-1.5">
        {ORDER.map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={status === s}
            title={status === s ? "Tap again to stop tracking" : undefined}
            disabled={pending}
            onClick={() => go(() => (status === s ? clearStatusAction(workId) : setStatusAction(workId, s)))}
            className="rounded-full border border-rule-strong px-3.5 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-ink hover:text-ink disabled:opacity-60 aria-checked:border-ink aria-checked:bg-ink aria-checked:text-paper"
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-[13px] text-ink-3">
        {(status === "read" || status === "dnf") && (
          <button className="underline-offset-4 hover:text-ink hover:underline" disabled={pending} onClick={() => go(() => startRereadAction(workId))}>
            Start a re-read
          </button>
        )}
        {status === null && hasReads && <span>Not currently tracking — your past reads are kept below.</span>}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

type CopyView = {
  id: string;
  format: CopyFormat;
  formatLabel: string;
  locationId: string | null;
  place: string | null;
  lentTo: string | null;
  lentAt: string | null;
  dueBackAt: string | null;
  overdue: boolean;
  edition: string;
};
type Place = { id: string; label: string };

export function CopyCard({ workId, copy, places }: { workId: string; copy: CopyView; places: Place[] }) {
  const { pending, error, go } = useAction();
  const [mode, setMode] = useState<"idle" | "lend" | "remove">("idle");
  const [to, setTo] = useState("");
  const [due, setDue] = useState("");
  return (
    <li className="flex flex-col gap-4 border border-rule bg-paper-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[15px]">
            {copy.formatLabel}
            {copy.edition && <span className="text-ink-3"> · {copy.edition}</span>}
          </span>
          {copy.lentTo ? (
            <span className={`text-sm ${copy.overdue ? "text-accent" : "text-ochre"}`}>
              With {copy.lentTo} since {formatDate(copy.lentAt)}
              {copy.dueBackAt && ` · ${copy.overdue ? "was due" : "due"} ${formatDate(copy.dueBackAt)}`}
            </span>
          ) : null}
        </div>
        {copy.format === "physical" && !copy.lentTo && mode === "idle" && (
          <Button variant="line" size="sm" onClick={() => setMode("lend")}>
            Lend
          </Button>
        )}
        {copy.lentTo && (
          <Button variant="line" size="sm" disabled={pending} onClick={() => go(() => returnCopyAction(workId, copy.id))}>
            Mark returned
          </Button>
        )}
      </div>

      {copy.format === "physical" && (
        <Field label="Shelf">
          <Select
            value={copy.locationId ?? ""}
            disabled={pending}
            onChange={(e) => go(() => moveCopyAction(workId, copy.id, e.target.value || null))}
            className="h-9 text-sm"
          >
            <option value="">Not shelved yet</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {copy.format === "physical" && places.length === 0 && (
        <p className="-mt-2 text-xs text-ink-3">
          <Link href="/places" className="underline underline-offset-2">
            Add your rooms and shelves
          </Link>{" "}
          to give books a place.
        </p>
      )}

      {mode === "lend" && (
        <form
          className="grid gap-3 border-t border-rule pt-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            go(() => lendCopyAction(workId, copy.id, { to, dueBack: due || null }), () => setMode("idle"));
          }}
        >
          <Field label="Lent to">
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Name" autoFocus required maxLength={80} className="h-9 text-sm" />
          </Field>
          <Field label="Due back">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9 text-sm" />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" disabled={pending}>
              Lend
            </Button>
            <Button size="sm" type="button" variant="quiet" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="flex items-center justify-between border-t border-rule pt-3 text-[13px]">
        {mode === "remove" ? (
          <span className="flex items-center gap-3">
            <span className="text-ink-2">Remove this copy? Reading history stays.</span>
            <button className="font-medium text-accent" disabled={pending} onClick={() => go(() => removeCopyAction(workId, copy.id))}>
              Remove
            </button>
            <button className="text-ink-3" onClick={() => setMode("idle")}>
              Keep
            </button>
          </span>
        ) : (
          <button className="text-ink-3 hover:text-accent" onClick={() => setMode("remove")}>
            Remove copy
          </button>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </li>
  );
}

export function AddCopy({ workId, editions, places, first }: { workId: string; editions: Place[]; places: Place[]; first: boolean }) {
  const { pending, error, go, setError } = useAction();
  const [open, setOpen] = useState(first);
  const [editionId, setEditionId] = useState(editions[0]?.id ?? "");
  const [format, setFormat] = useState<CopyFormat>("physical");
  const [locationId, setLocationId] = useState("");
  const [dupe, setDupe] = useState(false);
  if (!open) {
    return (
      <button className="self-start text-sm text-ink-2 underline underline-offset-4 hover:text-ink" onClick={() => setOpen(true)}>
        Add another copy
      </button>
    );
  }
  return (
    <form
      className="flex flex-col gap-3 border border-dashed border-rule-strong p-4"
      onSubmit={(e) => {
        e.preventDefault();
        go(async () => {
          const res = await addCopyAction(workId, { editionId, format, locationId: format === "physical" ? locationId || null : null, allowDuplicate: dupe });
          if (!res.ok && /already own/.test(res.error)) setDupe(true);
          return res;
        }, () => {
          setDupe(false);
          setOpen(false);
          setError(null);
        });
      }}
    >
      <span className="font-serif text-lg">{first ? "I own this" : "Add a copy"}</span>
      {editions.length > 1 && (
        <Field label="Edition">
          <Select value={editionId} onChange={(e) => setEditionId(e.target.value)} className="h-9 text-sm">
            {editions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Format">
          <Select value={format} onChange={(e) => setFormat(e.target.value as CopyFormat)} className="h-9 text-sm">
            <option value="physical">Print</option>
            <option value="ebook">Ebook</option>
            <option value="audio">Audiobook</option>
          </Select>
        </Field>
        {format === "physical" && (
          <Field label="Shelf">
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="h-9 text-sm">
              <option value="">Decide later</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || !editionId}>
          {dupe ? "Yes, add a second copy" : "Add to library"}
        </Button>
        {!first && (
          <Button size="sm" type="button" variant="quiet" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

type Read = { id: string; outcome: "in_progress" | "finished" | "dnf"; startedAt: string | null; finishedAt: string | null; rating: number | null; review: string | null };

export function ReadHistory({ workId, reads }: { workId: string; reads: Read[] }) {
  if (reads.length === 0) return <p className="text-[15px] text-ink-2">No reads recorded yet.</p>;
  return (
    <ol className="flex flex-col">
      {reads.map((r) => (
        <ReadRow key={r.id} workId={workId} read={r} />
      ))}
    </ol>
  );
}

function ReadRow({ workId, read }: { workId: string; read: Read }) {
  const { pending, error, go } = useAction();
  const [editing, setEditing] = useState(false);
  const [startedAt, setStartedAt] = useState(read.startedAt ?? "");
  const [finishedAt, setFinishedAt] = useState(read.finishedAt ?? "");
  const [review, setReview] = useState(read.review ?? "");
  const closed = read.outcome !== "in_progress";
  const range =
    read.outcome === "in_progress"
      ? read.startedAt
        ? `Started ${formatDate(read.startedAt)}`
        : "In progress"
      : [read.startedAt && formatDate(read.startedAt), read.finishedAt ? formatDate(read.finishedAt) : "date unknown"].filter(Boolean).join(" – ");
  return (
    <li className="flex flex-col gap-2 border-b border-rule py-4 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-2">
          <span className="text-[15px]">{read.outcome === "finished" ? "Finished" : read.outcome === "dnf" ? "Didn't finish" : "Reading"}</span>
          <span className="num text-sm text-ink-3">{range}</span>
        </span>
        <button className="text-[13px] text-ink-3 hover:text-ink" onClick={() => setEditing((v) => !v)}>
          {editing ? "Done" : "Edit"}
        </button>
      </div>
      {closed && <Rating value={read.rating} disabled={pending} onChange={(v) => go(() => updateReadAction(workId, read.id, { rating: v }))} />}
      {!editing && read.review && <p className="font-serif text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{read.review}</p>}
      {editing && (
        <form
          className="flex flex-col gap-3 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            go(() => updateReadAction(workId, read.id, { startedAt: startedAt || null, finishedAt: closed ? finishedAt || null : undefined, review }), () => setEditing(false));
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Started">
              <Input type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} className="h-9 text-sm" />
            </Field>
            {closed && (
              <Field label={read.outcome === "dnf" ? "Stopped" : "Finished"}>
                <Input type="date" value={finishedAt} onChange={(e) => setFinishedAt(e.target.value)} className="h-9 text-sm" />
              </Field>
            )}
          </div>
          {closed && (
            <Field label="Notes">
              <textarea value={review} onChange={(e) => setReview(e.target.value)} rows={4} className="w-full rounded-[3px] border border-rule-strong bg-paper-raised p-3 font-serif text-[15px] focus:border-ink focus:outline-none" />
            </Field>
          )}
          <div className="flex items-center justify-between">
            <Button size="sm" disabled={pending}>
              Save
            </Button>
            <button type="button" className="text-[13px] text-ink-3 hover:text-accent" onClick={() => go(() => deleteReadAction(workId, read.id))}>
              Delete this read
            </button>
          </div>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
    </li>
  );
}

/** Five stars, each split into halves; tapping the current value clears it. */
function Rating({ value, onChange, disabled }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="flex items-center gap-2" onMouseLeave={() => setHover(null)}>
      <div className="flex" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} className="relative h-5 w-5 text-[18px] leading-5">
            <span className="absolute inset-0 text-rule-strong">★</span>
            <span className="absolute inset-0 overflow-hidden text-ochre" style={{ width: shown >= star * 2 ? "100%" : shown === star * 2 - 1 ? "50%" : "0%" }}>
              ★
            </span>
            {[star * 2 - 1, star * 2].map((v, i) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={value === v}
                aria-label={`${v / 2} stars`}
                disabled={disabled}
                onMouseEnter={() => setHover(v)}
                onClick={() => onChange(value === v ? null : v)}
                className={`absolute inset-y-0 w-1/2 ${i === 0 ? "left-0" : "right-0"}`}
              />
            ))}
          </span>
        ))}
      </div>
      <span className="num text-xs text-ink-3">{value ? `${value / 2} / 5` : "Not rated"}</span>
    </div>
  );
}

export function ListPicker({ workId, lists, member }: { workId: string; lists: { id: string; name: string }[]; member: string[] }) {
  const { pending, error, go } = useAction();
  const [name, setName] = useState("");
  return (
    <div className="flex flex-col gap-3">
      {lists.length > 0 && (
        <ul className="flex flex-col">
          {lists.map((l) => {
            const on = member.includes(l.id);
            return (
              <li key={l.id}>
                <label className="flex cursor-pointer items-center gap-3 py-1.5 text-[15px]">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={pending}
                    onChange={() => go(() => (on ? removeFromListAction(l.id, workId) : addToListAction(l.id, workId)))}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  {l.name}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go(async () => {
            const res = await createListAction(name);
            if (res.ok) {
              const added = await addToListAction(res.data, workId);
              if (!added.ok) return added;
            }
            return res;
          }, () => setName(""));
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New list…" className="h-9 text-sm" maxLength={80} />
        <Button size="sm" variant="line" disabled={pending || !name.trim()}>
          Create
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
