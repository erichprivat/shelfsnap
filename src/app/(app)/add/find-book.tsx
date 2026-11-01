"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { addCopyAction, addManualBookAction, lookupIsbnAction, searchBooksAction, setStatusAction, type FoundBook } from "@/app/actions/books";
import { ManualBookForm } from "@/components/manual-book-form";
import { Cover } from "@/components/cover";
import { Button, ErrorText, Input } from "@/components/ui";

const TYPE_IT = "This browser can't scan barcodes. Type the 13-digit number under the barcode instead.";

const looksLikeIsbn = (q: string) => /^[\d\s-]{9,17}[\dxX]$/.test(q.trim());

export function FindBook() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState(false);
  const searched = results !== null || error !== null;

  const search = (query: string) =>
    start(async () => {
      setError(null);
      if (looksLikeIsbn(query)) {
        const res = await lookupIsbnAction(query);
        if (res.ok) router.push(`/book/${res.data.workId}`);
        else setError(res.error);
        return;
      }
      const res = await searchBooksAction(query);
      if (res.ok) setResults(res.data);
      else setError(res.error);
    });

  return (
    <div className="flex flex-col gap-8">
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) search(q);
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="“The Summer Book”, “Tove Jansson” or 9780…" aria-label="Title, author or ISBN" className="h-12 text-base" autoFocus />
        <div className="flex gap-2">
          <Button size="lg" disabled={pending || q.trim().length < 2}>
            {pending ? "Searching…" : "Search"}
          </Button>
          <Button size="lg" variant="line" type="button" onClick={() => setScanning((v) => !v)}>
            {scanning ? "Stop" : "Scan barcode"}
          </Button>
        </div>
      </form>
      {scanning && (
        <Scanner
          onCode={(code) => {
            setScanning(false);
            setQ(code);
            search(code);
          }}
          onError={(message) => {
            setScanning(false);
            setError(message);
          }}
        />
      )}
      <ErrorText>{error}</ErrorText>
      {results && results.length === 0 && !manual && <p className="text-ink-2">No books found. Try fewer words or the ISBN — or add it by hand below.</p>}
      {results && results.length > 0 && (
        <ul className="flex flex-col border-t border-rule">
          {results.map((b) => (
            <Result key={b.workId} book={b} />
          ))}
        </ul>
      )}
      {manual ? (
        <ManualBookForm
          initial={{ title: looksLikeIsbn(q) ? "" : q, isbn: looksLikeIsbn(q) ? q : "" }}
          submits={[
            { label: "I own this", value: "own" },
            { label: "Want to read", value: "want" },
          ]}
          pending={pending}
          onSubmit={(book, intent) =>
            start(async () => {
              setError(null);
              const res = await addManualBookAction(book, intent);
              if (res.ok) router.push(`/book/${res.data}`);
              else setError(res.error);
            })
          }
          onCancel={() => setManual(false)}
        />
      ) : (
        searched && (
          <button className="self-start text-sm text-ink-2 underline underline-offset-4 hover:text-ink" onClick={() => setManual(true)}>
            Can&apos;t find it? Add it by hand
          </button>
        )
      )}
    </div>
  );
}

function Result({ book }: { book: FoundBook }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, label: string) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) setDone(label);
      else setError(res.error ?? null);
    });
  return (
    <li className="flex gap-4 border-b border-rule py-4">
      <Link href={`/book/${book.workId}`} className="w-14 shrink-0">
        <Cover seed={book.workId} title={book.title} authors={book.authors} url={book.coverUrl} size="sm" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/book/${book.workId}`} className="flex min-w-0 flex-col">
          <span className="font-serif text-lg leading-snug hover:underline">{book.title}</span>
          <span className="text-sm text-ink-3">
            {book.authors.slice(0, 2).join(", ") || "Unknown author"}
            {book.year ? ` · ${book.year}` : ""}
          </span>
        </Link>
        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          {done ? (
            <span className="text-sm text-moss">{done}</span>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={() => act(() => addCopyAction(book.workId, { editionId: book.editionId }), "Added to your library")}>
                I own this
              </Button>
              <Button size="sm" variant="line" disabled={pending} onClick={() => act(() => setStatusAction(book.workId, "want_to_read"), "On your wishlist")}>
                Want to read
              </Button>
            </div>
          )}
          {error && (
            <span className="text-xs text-accent">
              {error}{" "}
              <Link href={`/book/${book.workId}`} className="underline">
                Open book
              </Link>
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function Scanner({ onCode, onError }: { onCode: (code: string) => void; onError: (message: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onCode, onError });
  useEffect(() => {
    callbacks.current = { onCode, onError };
  });
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return callbacks.current.onError(TYPE_IT);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch (e) {
        const denied = e instanceof DOMException && e.name === "NotAllowedError";
        return callbacks.current.onError(denied ? "Readmoth isn't allowed to use the camera. Allow it in your browser settings, or type the 13-digit number under the barcode." : TYPE_IT);
      }
      if (stopped || !video.current) return stream.getTracks().forEach((t) => t.stop());
      video.current.srcObject = stream;
      try {
        await video.current.play();
        const { isbnDetector, isIsbnBarcode } = await import("@/lib/isbn-scanner");
        const detector = await isbnDetector();
        while (!stopped) {
          const codes = video.current.readyState >= 2 ? await detector.detect(video.current).catch(() => []) : [];
          const isbn = codes.map((c) => c.rawValue).find(isIsbnBarcode);
          if (isbn) return callbacks.current.onCode(isbn);
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch {
        if (!stopped) callbacks.current.onError(TYPE_IT);
      }
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <div className="relative aspect-video max-w-xl overflow-hidden bg-ink">
      <video ref={video} className="h-full w-full object-cover" muted playsInline />
      <span className="absolute inset-x-[15%] top-1/2 h-px bg-accent" />
      <span className="absolute inset-x-0 bottom-0 bg-ink/70 px-3 py-2 text-xs text-paper">Point at the barcode on the back cover</span>
    </div>
  );
}
