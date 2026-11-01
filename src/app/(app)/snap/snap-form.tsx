"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { createSnapAction } from "@/app/actions/snap";
import { Button, ErrorText, Field, Select } from "@/components/ui";

export function SnapForm({ places, defaultPlace }: { places: { id: string; label: string }[]; defaultPlace: string }) {
  const [state, action, pending] = useActionState(createSnapAction, undefined);
  const [preview, setPreview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div className="relative">
        <label
          className={`relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden border border-dashed text-center transition-colors ${
            preview ? "border-transparent" : "border-rule-strong bg-paper-raised hover:border-ink"
          }`}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={preview} alt="Your shelf photo" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <>
              <svg viewBox="0 0 48 48" className="h-12 w-12 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
                <path d="M6 15h7l3-4h16l3 4h7v24H6z" strokeLinejoin="round" />
                <circle cx="24" cy="26" r="7.5" />
              </svg>
              <span className="font-serif text-xl">Take or choose a photo</span>
              <span className="text-sm text-ink-3">JPEG, PNG or HEIC · up to 20 MB</span>
            </>
          )}
          {pending && (
            <span className="absolute inset-0 bg-ink/35">
              <span className="absolute inset-x-0 h-24 animate-[scan_1.8s_ease-in-out_infinite_alternate] bg-gradient-to-b from-transparent via-paper/40 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 bg-ink/80 px-4 py-3 text-left text-sm text-paper">Reading spines… this takes about half a minute.</span>
            </span>
          )}
          <input
            ref={input}
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture="environment"
            required
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
          />
        </label>
        {preview && !pending && (
          <button type="button" className="mt-2 text-sm text-ink-3 underline underline-offset-4 hover:text-ink" onClick={() => input.current?.click()}>
            Use a different photo
          </button>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <Field label="Which shelf is this?" hint={places.length === 0 ? undefined : "Books are added in the order they stand, after anything already there."}>
          <Select name="locationId" defaultValue={defaultPlace}>
            <option value="">Decide later</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        {places.length === 0 && (
          <p className="-mt-3 text-sm text-ink-3">
            <Link href="/places" className="underline underline-offset-4">
              Set up rooms and shelves
            </Link>{" "}
            first if you&apos;d like books placed as you go.
          </p>
        )}
        <ol className="flex flex-col gap-2 border-t border-rule pt-5 text-sm text-ink-2">
          {["Hold the phone level, square to the shelf.", "Get close enough that spine text is readable.", "Avoid glare from lamps and windows."].map((t, i) => (
            <li key={t} className="flex gap-3">
              <span className="font-mono text-xs text-ink-3">0{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
        <ErrorText>{state && !state.ok ? state.error : null}</ErrorText>
        <Button variant="accent" size="lg" disabled={pending || !preview}>
          {pending ? "Reading spines…" : "Read this shelf"}
        </Button>
      </div>
    </form>
  );
}
