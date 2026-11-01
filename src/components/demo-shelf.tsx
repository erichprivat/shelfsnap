import { Spine } from "./spine";

const BOOKS: [string, string, number][] = [
  ["Middlemarch", "George Eliot", 880],
  ["Sult", "Knut Hamsun", 230],
  ["Piranesi", "Susanna Clarke", 272],
  ["The Left Hand of Darkness", "Ursula K. Le Guin", 304],
  ["Stoner", "John Williams", 288],
  ["Beloved", "Toni Morrison", 324],
  ["Kristin Lavransdatter", "Sigrid Undset", 1124],
  ["The Remains of the Day", "Kazuo Ishiguro", 258],
  ["Moby-Dick", "Herman Melville", 720],
  ["Pachinko", "Min Jin Lee", 496],
  ["Orlando", "Virginia Woolf", 333],
  ["The Summer Book", "Tove Jansson", 172],
  ["Austerlitz", "W. G. Sebald", 298],
];

/** Marketing illustration: a real shelf of spines with the snap overlay the review screen uses. */
export function DemoShelf() {
  return (
    <figure className="relative select-none" aria-label="A bookshelf being catalogued">
      <div className="relative flex h-64 items-end gap-[3px] overflow-hidden px-3 sm:h-72">
        {BOOKS.map(([title, author, pages], i) => (
          <div key={title} className="relative flex h-full items-end pt-7">
            <Spine seed={title} title={title} authors={[author]} pageCount={pages} />
            {i < 9 && (
              <span
                className={`absolute top-0 left-1/2 flex h-5 min-w-5 -translate-x-1/2 items-center justify-center rounded-full px-1 font-mono text-[10px] ${
                  i === 7 ? "bg-ochre text-paper" : "bg-ink text-paper"
                }`}
              >
                {i + 1}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="shelf-board" />
      <div className="shelf-shade" />
      <figcaption className="mt-4 flex items-center justify-between font-mono text-[11px] text-ink-3">
        <span>IMG_2048.HEIC · living room, shelf 2</span>
        <span>8 matched · 1 to check</span>
      </figcaption>
    </figure>
  );
}
