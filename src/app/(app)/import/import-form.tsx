"use client";

import { useActionState, useState } from "react";
import { importAction } from "@/app/actions/account";
import { Button, ErrorText, LinkButton } from "@/components/ui";
import { plural } from "@/lib/labels";

export function ImportForm() {
  const [state, action, pending] = useActionState(importAction, undefined);
  const [name, setName] = useState<string | null>(null);
  const report = state?.ok ? state.data : null;

  if (report) {
    const problems = [...report.failed.map((f) => ({ line: f.line, text: `${f.title}: ${f.reason}` })), ...report.skipped.map((s) => ({ line: s.line, text: s.reason })), ...report.warnings.map((w) => ({ line: w.line, text: `${w.title}: ${w.message}` }))].sort((a, b) => a.line - b.line);
    return (
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className="label">{report.source === "goodreads" ? "Goodreads import" : "StoryGraph import"}</span>
          <h2 className="font-serif text-3xl">{report.imported ? `${plural(report.imported, "book")} imported` : "Nothing new to import"}</h2>
        </div>
        <dl className="grid grid-cols-2 gap-px border border-rule bg-rule xl:grid-cols-4">
          {[
            ["Imported", report.imported],
            ["Copies added", report.copiesAdded],
            ["Already here", report.alreadyImported],
            ["Kept yours", report.statusesKept],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1 bg-paper p-4">
              <dd className="num font-serif text-3xl">{v}</dd>
              <dt className="label">{k}</dt>
            </div>
          ))}
        </dl>
        {problems.length > 0 && (
          <details className="border-t border-rule pt-4 text-sm">
            <summary className="cursor-pointer text-ink-2">{plural(problems.length, "row")} worth a look</summary>
            <ul className="mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto font-mono text-[12px] text-ink-2">
              {problems.map((p, i) => (
                <li key={i}>
                  <span className="text-ink-3">line {p.line}</span> · {p.text}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="flex gap-2">
          <LinkButton href="/library">Go to your library</LinkButton>
          {report.copiesAdded > 0 && (
            <LinkButton href="/snap" variant="line">
              Shelve them with a snap
            </LinkButton>
          )}
        </div>
      </section>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-rule-strong bg-paper-raised px-6 py-14 text-center transition-colors hover:border-ink">
        <span className="font-serif text-xl">{name ?? "Choose your export file"}</span>
        <span className="text-sm text-ink-3">{name ? "Ready to import" : "goodreads_library_export.csv or StoryGraph .csv"}</span>
        <input type="file" name="file" accept=".csv,text/csv" required className="sr-only" onChange={(e) => setName(e.target.files?.[0]?.name ?? null)} />
      </label>
      <ErrorText>{state && !state.ok ? state.error : null}</ErrorText>
      <Button size="lg" disabled={pending || !name} className="self-start">
        {pending ? "Importing… big libraries take a minute" : "Import"}
      </Button>
    </form>
  );
}
