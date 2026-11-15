"use client";

import { joinFeaturedAction } from "@/app/actions/challenges";
import { Button, ErrorText } from "@/components/ui";
import { useAction } from "@/lib/use-action";

export function JoinFeatured({ id, size = "sm" }: { id: string; size?: "sm" | "md" }) {
  const { pending, error, go } = useAction();
  return (
    <div className="flex flex-col gap-1">
      <Button size={size} variant="line" disabled={pending} onClick={() => go(() => joinFeaturedAction(id))}>
        {pending ? "Joining…" : "Join"}
      </Button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
