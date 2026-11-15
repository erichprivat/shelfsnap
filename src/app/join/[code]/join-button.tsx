"use client";

import { joinByCodeAction } from "@/app/actions/challenges";
import { Button, ErrorText } from "@/components/ui";
import { useAction } from "@/lib/use-action";

export function JoinButton({ code }: { code: string }) {
  const { pending, error, go } = useAction();
  return (
    <>
      <Button size="lg" variant="accent" disabled={pending} onClick={() => go(() => joinByCodeAction(code))}>
        {pending ? "Joining…" : "Join the challenge"}
      </Button>
      <ErrorText>{error}</ErrorText>
    </>
  );
}
