"use client";

import Link from "next/link";
import { useState } from "react";
import { sendFeedbackAction } from "@/app/actions/account";
import { Button, ErrorText, inputClass } from "@/components/ui";
import { MAX_FEEDBACK_LENGTH } from "@/lib/feedback";
import { useAction } from "@/lib/use-action";

export function FeedbackForm({ page }: { page: string | null }) {
  const { pending, error, go } = useAction();
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-serif text-2xl">Thank you — it&apos;s on its way.</h2>
        <p className="text-ink-2">If it needs an answer, you&apos;ll get one by email.</p>
        <div className="flex gap-4 text-sm">
          <Link href={page ?? "/library"} className="underline underline-offset-4 hover:text-accent">
            Back to where you were
          </Link>
          <button className="text-ink-2 underline underline-offset-4 hover:text-ink" onClick={() => (setMessage(""), setSent(false))}>
            Send another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        go(() => sendFeedbackAction(message, page), () => setSent(true));
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="label">Your message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={MAX_FEEDBACK_LENGTH}
          rows={8}
          autoFocus
          placeholder="The snap of my hallway shelf missed the three Penguin classics on the left…"
          className={`${inputClass} h-auto resize-y py-2.5 leading-relaxed`}
        />
      </label>
      {page && <span className="text-xs text-ink-3">Sent along with the page you came from: {page}</span>}
      <ErrorText>{error}</ErrorText>
      <div>
        <Button disabled={pending || message.trim().length < 2}>{pending ? "Sending…" : "Send feedback"}</Button>
      </div>
    </form>
  );
}
