"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { createPlaceAction, deletePlaceAction, movePlaceAction, renamePlaceAction } from "@/app/actions/places";
import { Button, ErrorText, Input } from "@/components/ui";
import type { LocationNode } from "@/domain/locations";
import { useAction } from "@/lib/use-action";
import { plural } from "@/lib/labels";

const MAX_DEPTH = 4;

const total = (n: LocationNode): number => n.copyCount + n.children.reduce((s, c) => s + total(c), 0);

function flatten(nodes: LocationNode[], depth = 0, prefix = ""): { id: string; label: string; depth: number }[] {
  return nodes.flatMap((n) => [{ id: n.id, label: prefix + n.name, depth }, ...flatten(n.children, depth + 1, `${prefix}${n.name} / `)]);
}

export function PlacesEditor({ tree }: { tree: LocationNode[] }) {
  const all = flatten(tree);
  return (
    <div className="flex flex-col gap-10">
      {tree.length === 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-serif text-xl">Start with a room.</p>
          <p className="text-sm text-ink-2">For example “Living room”, then add “Tall bookcase” inside it, then “Shelf 1”, “Shelf 2”…</p>
        </div>
      )}
      {tree.length > 0 && (
      <div className="grid gap-x-10 gap-y-10 md:grid-cols-2">
        {tree.map((room) => (
          <section key={room.id} className="flex flex-col border-t-2 border-ink pt-4">
            <Node node={room} depth={0} all={all} />
          </section>
        ))}
      </div>
      )}
      <AddPlace parentId={null} label="Add a room" placeholder="Living room" />
    </div>
  );
}

function Node({ node, depth, all }: { node: LocationNode; depth: number; all: { id: string; label: string; depth: number }[] }) {
  const { pending, error, go } = useAction();
  const [mode, setMode] = useState<"idle" | "rename" | "move" | "delete" | "add">("idle");
  const [name, setName] = useState(node.name);
  const count = total(node);
  const isRoom = depth === 0;
  const moveTargets = all.filter((p) => p.id !== node.id && !p.label.startsWith(`${all.find((x) => x.id === node.id)?.label} /`));
  return (
    <div className={depth > 0 ? "border-t border-rule" : ""}>
      <div className={`group flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 ${isRoom ? "pb-2" : "py-2.5"}`} style={{ paddingLeft: depth > 1 ? (depth - 1) * 20 : 0 }}>
        {mode === "rename" ? (
          <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); go(() => renamePlaceAction(node.id, name), () => setMode("idle")); }}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} className="h-9 text-sm" />
            <Button size="sm" disabled={pending}>Save</Button>
            <Button size="sm" type="button" variant="quiet" onClick={() => { setName(node.name); setMode("idle"); }}>Cancel</Button>
          </form>
        ) : (
          <span className="flex items-baseline gap-3">
            <span className={isRoom ? "font-serif text-2xl" : "text-[15px]"}>{node.name}</span>
            <span className="num text-xs text-ink-3">{count ? plural(count, "book") : "empty"}</span>
          </span>
        )}
        {mode === "idle" && (
          <span className="flex gap-3 text-[13px] text-ink-3 sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            <Link href={`/snap?place=${node.id}`} className="hover:text-ink">Snap</Link>
            {!isRoom && depth < MAX_DEPTH - 1 && <button className="hover:text-ink" onClick={() => setMode("add")}>Add inside</button>}
            <button className="hover:text-ink" onClick={() => setMode("rename")}>Rename</button>
            <button className="hover:text-ink" onClick={() => setMode("move")}>Move</button>
            <button className="hover:text-accent" onClick={() => setMode("delete")}>Remove</button>
          </span>
        )}
      </div>
      {mode === "move" && (
        <div className="flex flex-wrap items-center gap-2 pb-3 text-sm">
          <span className="text-ink-2">Move into</span>
          <select className="h-8 rounded-[3px] border border-rule-strong bg-paper-raised px-2" defaultValue="" onChange={(e) => go(() => movePlaceAction(node.id, e.target.value === "__top" ? null : e.target.value), () => setMode("idle"))} disabled={pending}>
            <option value="" disabled>Choose…</option>
            <option value="__top">Top level (a room)</option>
            {moveTargets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button className="text-ink-3" onClick={() => setMode("idle")}>Cancel</button>
        </div>
      )}
      {mode === "delete" && (
        <div className="flex flex-wrap items-center gap-3 pb-3 text-sm">
          <span className="text-ink-2">Remove “{node.name}”?{count > 0 && ` Its ${plural(count, "book")} move up a level.`}</span>
          <button className="font-medium text-accent" disabled={pending} onClick={() => go(() => deletePlaceAction(node.id))}>Remove</button>
          <button className="text-ink-3" onClick={() => setMode("idle")}>Keep</button>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      {node.children.map((c) => <Node key={c.id} node={c} depth={depth + 1} all={all} />)}
      {mode === "add" && (
        <div style={{ paddingLeft: depth * 20 }}>
          <AddPlace parentId={node.id} label="" placeholder="Shelf 1" compact startOpen onClose={() => setMode("idle")} />
        </div>
      )}
      {isRoom && (
        <div className="border-t border-rule pt-1">
          <AddPlace parentId={node.id} label="Add a bookcase or shelf" placeholder={node.children.length ? `Shelf ${node.children.length + 1}` : "Tall bookcase"} compact />
        </div>
      )}
    </div>
  );
}

function AddPlace({ parentId, label, placeholder, compact, startOpen, onClose }: { parentId: string | null; label: string; placeholder: string; compact?: boolean; startOpen?: boolean; onClose?: () => void }) {
  const { pending, error, go } = useAction();
  const [open, setOpen] = useState(startOpen ?? false);
  const close = () => (onClose ? onClose() : setOpen(false));
  const [name, setName] = useState("");
  const field = useRef<HTMLInputElement>(null);
  if (!open) {
    return compact ? (
      <button className="py-1.5 text-[13px] text-ink-3 hover:text-ink" onClick={() => setOpen(true)}>+ {label}</button>
    ) : (
      <Button variant="line" className="self-start" onClick={() => setOpen(true)}>{label}</Button>
    );
  }
  return (
    <form className="flex flex-col gap-2 py-2" onSubmit={(e) => { e.preventDefault(); if (pending || !name.trim()) return; go(() => createPlaceAction(name, parentId), () => {
            setName("");
            requestAnimationFrame(() => field.current?.focus());
          }); }}>
      <div className="flex max-w-md gap-2">
        <Input ref={field} value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} autoFocus maxLength={60} className={compact ? "h-9 text-sm" : ""} />
        <Button size={compact ? "sm" : "md"} disabled={!name.trim()}>Add</Button>
        <Button size={compact ? "sm" : "md"} type="button" variant="quiet" onClick={close}>Done</Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}
