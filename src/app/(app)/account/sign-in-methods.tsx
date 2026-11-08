"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorText } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

const LABELS = { google: "Google", apple: "Apple" } as const;
type Provider = keyof typeof LABELS;

/** Connect or disconnect Google/Apple; a connected account can then be used to sign in, whatever its address. */
export function SignInMethods({ providers, connected, failed }: { providers: Provider[]; connected: { provider: Provider; id: string }[]; failed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(failed ? "That account couldn't be connected. It may already belong to another Readmoth account." : null);

  async function connect(provider: Provider) {
    setBusy(provider);
    setError(null);
    const res = await authClient.linkSocial({ provider, callbackURL: "/account", errorCallbackURL: "/account?connect=failed" });
    if (res.error) {
      setError("That didn't work. Try again.");
      setBusy(null);
    }
  }

  async function disconnect(provider: Provider, accountId: string) {
    setBusy(provider);
    setError(null);
    const res = await authClient.unlinkAccount({ accountId });
    setBusy(null);
    if (res.error) setError("That didn't work. Try again.");
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {providers.map((p) => {
        const link = connected.find((c) => c.provider === p);
        return link ? (
          <div key={p} className="flex items-center justify-between gap-4">
            <span className="text-ink">{LABELS[p]} connected</span>
            <Button variant="quiet" disabled={busy !== null} onClick={() => disconnect(p, link.id)}>
              {busy === p ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        ) : (
          <Button key={p} variant="line" className="self-start" disabled={busy !== null} onClick={() => connect(p)}>
            {busy === p ? "Opening…" : `Connect ${LABELS[p]}`}
          </Button>
        );
      })}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
