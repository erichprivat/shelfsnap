"use client";

import { useState } from "react";
import { deleteChallengeAction, leaveChallengeAction } from "@/app/actions/challenges";
import { Button, ErrorText } from "@/components/ui";
import { useAction } from "@/lib/use-action";

export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <h2 className="border-b border-rule pb-2 font-serif text-2xl">Invite</h2>
      <p className="text-sm text-ink-2">Anyone with this link and a Readmoth account can join. They&apos;ll see first names and progress.</p>
      <div className="flex gap-2">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-[3px] border border-rule-strong bg-paper-raised px-2 font-mono text-xs text-ink-2" aria-label="Invite link" />
        <Button
          size="sm"
          variant="line"
          onClick={async () => {
            await navigator.clipboard.writeText(url).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function LeaveOrDelete({ id, owner }: { id: string; owner: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const { pending, error, go } = useAction();
  const act = () => go(() => (owner ? deleteChallengeAction(id) : leaveChallengeAction(id)));
  return (
    <div className="flex flex-col items-start gap-2 text-sm">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-2">{owner ? "Delete it for everyone?" : "Leave and clear your card?"}</span>
          <Button size="sm" variant="ink" disabled={pending} onClick={act}>
            {owner ? "Delete" : "Leave"}
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="text-ink-3 underline-offset-4 hover:text-ink hover:underline">
          {owner ? "Delete challenge" : "Leave challenge"}
        </button>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
