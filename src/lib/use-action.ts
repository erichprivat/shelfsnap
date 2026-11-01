"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/server/action";

/** Runs a server action in a transition and keeps its error message for display. */
export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = (fn: () => Promise<ActionResult<unknown>>, onSuccess?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error);
      else onSuccess?.();
    });
  return { pending, error, go, setError };
}
