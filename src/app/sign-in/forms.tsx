"use client";

import { useActionState, useState } from "react";
import { sendMagicLinkAction } from "@/app/actions/account";
import { Button, ErrorText, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export function MagicLinkForm() {
  const [state, action, pending] = useActionState(sendMagicLinkAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@example.com" autoFocus />
      </Field>
      <ErrorText>{state && !state.ok ? state.error : null}</ErrorText>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}

const LABELS = { google: "Continue with Google", apple: "Continue with Apple" } as const;

export function SocialButtons({ providers }: { providers: ("google" | "apple")[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {providers.map((p) => (
        <Button
          key={p}
          variant="line"
          size="lg"
          disabled={busy !== null}
          onClick={async () => {
            setBusy(p);
            setError(null);
            const res = await authClient.signIn.social({ provider: p, callbackURL: "/library", newUserCallbackURL: "/welcome", errorCallbackURL: "/sign-in" });
            if (res.error) {
              setError("That didn't work. Try again, or use your email instead.");
              setBusy(null);
            }
          }}
        >
          {busy === p ? "Opening…" : LABELS[p]}
        </Button>
      ))}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
