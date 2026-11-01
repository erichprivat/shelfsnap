"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createListAction } from "@/app/actions/lists";
import { Button, ErrorText, Input } from "@/components/ui";

export function NewList() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <Button onClick={() => setOpen(true)}>New list</Button>;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createListAction(name);
          if (res.ok) router.push(`/lists/${res.data}`);
          else setError(res.error);
        });
      }}
    >
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name your list" autoFocus maxLength={80} className="w-56" />
        <Button disabled={pending || !name.trim()}>Create</Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}
