import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoShelf } from "@/components/demo-shelf";
import { Wordmark } from "@/components/logo";
import { LinkButton } from "@/components/ui";
import { getSession } from "@/server/auth";

const STEPS = [
  ["Snap", "Photograph a shelf. Readmoth reads every spine it can see, left to right, top shelf first."],
  ["Check", "Confident matches are ticked for you. Anything uncertain shows its best guesses — one tap to pick."],
  ["Shelve", "Books land in the room and shelf you chose, in the order they stand. Find any copy later in seconds."],
];

export default async function Home() {
  if (await getSession()) redirect("/library");
  return (
    <div className="grain min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 sm:px-8">
        <Wordmark />
        <Link href="/sign-in" className="text-sm text-ink-2 underline-offset-4 hover:text-ink hover:underline">
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-8">
        <section className="grid gap-12 pt-10 pb-20 lg:grid-cols-[1.05fr_1fr] lg:items-end lg:gap-16 lg:pt-20">
          <div className="flex flex-col gap-7">
            <span className="label">For people who own their books</span>
            <h1 className="font-serif text-[3.2rem] leading-[0.95] tracking-[-0.02em] text-balance sm:text-[4.6rem]">
              Your library, catalogued <em className="text-accent">in a&nbsp;snap.</em>
            </h1>
            <p className="max-w-md text-lg leading-relaxed text-ink-2">
              Photograph your shelves and Readmoth builds the catalogue: every book, which room it lives in, who borrowed it, and
              whether you&apos;ve actually read it.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <LinkButton href="/sign-in" variant="accent" size="lg">
                Start your library
              </LinkButton>
              <span className="text-sm text-ink-3">Free. Bring your Goodreads or StoryGraph history.</span>
            </div>
          </div>
          <DemoShelf />
        </section>

        <section className="grid border-t border-rule sm:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <div key={title} className="flex flex-col gap-3 border-rule py-8 sm:border-l sm:px-8 sm:first:border-l-0 sm:first:pl-0">
              <span className="font-mono text-xs text-ink-3">0{i + 1}</span>
              <h2 className="font-serif text-2xl">{title}</h2>
              <p className="text-[15px] leading-relaxed text-ink-2">{body}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-10 border-t border-rule py-16 lg:grid-cols-[1fr_1.4fr]">
          <h2 className="font-serif text-3xl leading-tight text-balance">Owning a book and reading it are two different things.</h2>
          <div className="grid gap-8 text-[15px] leading-relaxed text-ink-2 sm:grid-cols-2">
            <p>
              Reading apps lump them together, so your shelves turn into a to-do list. Readmoth keeps them apart: the copies you
              own, where each one stands, and a separate, honest record of what you&apos;ve read, abandoned or are halfway
              through.
            </p>
            <p>
              Which means questions like <span className="text-ink">“what do I own but haven&apos;t read?”</span>,{" "}
              <span className="text-ink">“who has my copy of Stoner?”</span> or{" "}
              <span className="text-ink">“what&apos;s on my wishlist that I don&apos;t own yet?”</span> each have an answer.
            </p>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl justify-between border-t border-rule px-4 py-8 text-xs text-ink-3 sm:px-8">
        <span>Readmoth</span>
        <span>Catalogue data from Open Library</span>
      </footer>
    </div>
  );
}
