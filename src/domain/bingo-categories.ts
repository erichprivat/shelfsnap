/** What we know about a finished book, for deciding which bingo squares it can fill. */
export type BookFacts = {
  title: string;
  pages: number | null;
  /** First published. */
  year: number | null;
  subjects: string[];
  /** Language of the edition read, as Open Library codes it ("eng", "ger", …). */
  language: string | null;
  /** When the reader added their first copy (ms), null if they don't own it. */
  ownedSince: number | null;
  /** When they finished it (ISO date). */
  finishedOn: string;
};

export type Category = {
  id: string;
  label: string;
  /** Squares in one group overlap too much to share a card. */
  group?: string;
  /** Without a rule the reader decides; with one, Readmoth suggests books that fit. */
  rule?: (b: BookFacts) => boolean;
};

export type ThemeId = "classic" | "time" | "world" | "genre" | "size" | "shelves" | "voices";

export type Theme = { id: ThemeId; name: string; blurb: string; categories: string[] };

const subject = (...words: string[]) => (b: BookFacts) =>
  b.subjects.some((s) => {
    const l = s.toLowerCase();
    return words.some((w) => l.includes(w));
  });
const yearBetween = (from: number, to: number) => (b: BookFacts) => b.year !== null && b.year >= from && b.year <= to;
const pagesAtLeast = (n: number) => (b: BookFacts) => b.pages !== null && b.pages >= n;
const pagesAtMost = (n: number) => (b: BookFacts) => b.pages !== null && b.pages <= n;
const titleWords = (b: BookFacts) => b.title.replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter(Boolean);
const titleHas = (re: RegExp) => (b: BookFacts) => re.test(b.title);
const finishedYear = (b: BookFacts) => Number(b.finishedOn.slice(0, 4));
const ownedForYears = (years: number) => (b: BookFacts) =>
  b.ownedSince !== null && Date.parse(`${b.finishedOn}T12:00:00Z`) - b.ownedSince >= years * 365.25 * 86_400_000;

const COLOURS = /\b(red|blue|green|yellow|black|white|gold(en)?|silver|purple|violet|orange|pink|grey|gray|scarlet|crimson|amber|indigo|rot|blau|grün|gelb|schwarz|weiß|weiss|rød|blå|grønn|gul|svart|hvit)\b/i;
const NUMBERS = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|hundred|thousand|million|first|second|third|eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|hundert|tausend|en|to|tre|fire|fem|seks|sju|åtte|ni|ti)\b/i;
const ANIMALS = /\b(cat|dog|bird|horse|wolf|fox|bear|whale|fish|lion|tiger|owl|crow|raven|moth|butterfly|snake|rabbit|hare|deer|mouse|rat|elephant|monkey|pig|goat|sheep|cow|bee|spider|shark|dragon|katze|hund|vogel|pferd|wolf|fuchs|bär|wal|katt|hest|ulv|rev|bjørn|hval|fugl)s?\b/i;
const NATURE = /\b(sea|ocean|river|lake|mountain|forest|wood|woods|tree|trees|garden|island|desert|snow|rain|wind|storm|sky|sun|moon|star|stars|meer|see|fluss|berg|berge|wald|baum|garten|insel|schnee|regen|himmel|sonne|mond|hav|elv|fjell|skog|tre|hage|øy|snø|regn|vind|himmel|sol|måne)\b/i;
const PEOPLE = /\b(mother|father|daughter|son|sister|brother|wife|husband|girl|boy|woman|man|king|queen|prince|princess|child|children|friend|lover|mutter|vater|tochter|sohn|schwester|bruder|frau|mann|mädchen|junge|könig|königin|mor|far|datter|sønn|søster|bror|kone|jente|gutt|konge|dronning)\b/i;
const PLACE_WORDS = /\b(city|town|street|road|house|home|hotel|station|harbour|harbor|london|paris|new york|berlin|rome|tokyo|oslo|venice|stadt|straße|strasse|haus|by|gate|hus|hjem)\b/i;
const TIME_WORDS = /\b(day|days|night|nights|morning|evening|summer|winter|spring|autumn|year|years|hour|hours|time|tomorrow|yesterday|tag|nacht|sommer|winter|jahr|zeit|dag|natt|sommer|vinter|år|tid)\b/i;

export const CATEGORIES: Category[] = [
  // Time Traveller
  { id: "before-1700", label: "Written before 1700", group: "era-old", rule: yearBetween(-3000, 1699) },
  { id: "1700s", label: "Written in the 1700s", group: "era-1700", rule: yearBetween(1700, 1799) },
  { id: "1800-1849", label: "Written 1800–1849", group: "era-1800a", rule: yearBetween(1800, 1849) },
  { id: "1850-1899", label: "Written 1850–1899", group: "era-1800b", rule: yearBetween(1850, 1899) },
  { id: "1900-1929", label: "Written 1900–1929", group: "era-1900", rule: yearBetween(1900, 1929) },
  { id: "1930s-40s", label: "Written in the 30s or 40s", group: "era-1930", rule: yearBetween(1930, 1949) },
  { id: "1950s", label: "Written in the 50s", group: "era-1950", rule: yearBetween(1950, 1959) },
  { id: "1960s", label: "Written in the 60s", group: "era-1960", rule: yearBetween(1960, 1969) },
  { id: "1970s", label: "Written in the 70s", group: "era-1970", rule: yearBetween(1970, 1979) },
  { id: "1980s", label: "Written in the 80s", group: "era-1980", rule: yearBetween(1980, 1989) },
  { id: "1990s", label: "Written in the 90s", group: "era-1990", rule: yearBetween(1990, 1999) },
  { id: "2000s", label: "Written in the 2000s", group: "era-2000", rule: yearBetween(2000, 2009) },
  { id: "2010s", label: "Written in the 2010s", group: "era-2010", rule: yearBetween(2010, 2019) },
  { id: "this-year", label: "Published this year", group: "era-now", rule: (b) => b.year !== null && b.year >= finishedYear(b) },
  { id: "birth-year", label: "Published the year you were born", group: "era-personal" },
  { id: "century-old", label: "Over 100 years old", group: "era-old2", rule: (b) => b.year !== null && finishedYear(b) - b.year >= 100 },
  { id: "decade-old", label: "Exactly a decade old", group: "era-now2", rule: (b) => b.year !== null && finishedYear(b) - b.year === 10 },
  { id: "set-in-past", label: "Set more than 100 years before it was written" },
  { id: "set-in-future", label: "Set in the future", rule: subject("future", "dystopia", "dystopias") },
  { id: "historical-fiction", label: "Historical fiction", rule: subject("historical fiction", "historical novel") },
  { id: "classic-unread", label: "A classic you always pretended to have read" },
  { id: "ancient-world", label: "Set in the ancient world", rule: subject("ancient", "rome", "greece", "egypt") },
  { id: "war-time", label: "Set during a war", rule: subject("war", "world war") },
  { id: "year-you-were-10", label: "Published the year you turned ten", group: "era-personal" },
  { id: "turn-of-century", label: "Set around 1900", rule: subject("19th century", "20th century") },
  { id: "medieval", label: "Set in the Middle Ages", rule: subject("middle ages", "medieval") },
  { id: "parents-era", label: "A book your parents read when they were young" },

  // Around the World
  { id: "translated", label: "Read in translation" },
  { id: "not-english", label: "Read in a language other than English", rule: (b) => b.language !== null && !["eng", "en"].includes(b.language) },
  { id: "nordic-author", label: "Nordic author" },
  { id: "african-author", label: "Author from Africa" },
  { id: "latin-american-author", label: "Latin American author" },
  { id: "asian-author", label: "Author from Asia" },
  { id: "middle-east-author", label: "Author from the Middle East" },
  { id: "oceania-author", label: "Author from Australia or the Pacific" },
  { id: "eastern-europe-author", label: "Author from Eastern Europe" },
  { id: "new-country", label: "From a country you've never read before" },
  { id: "island-setting", label: "Set on an island", rule: subject("island") },
  { id: "city-visited", label: "Set in a city you've visited" },
  { id: "dream-trip", label: "Set somewhere you want to travel" },
  { id: "home-town", label: "Set where you grew up" },
  { id: "cold-place", label: "Set somewhere cold", rule: subject("arctic", "antarctic", "polar", "siberia", "greenland") },
  { id: "desert-setting", label: "Set in a desert", rule: subject("desert") },
  { id: "at-sea", label: "Set at sea", rule: subject("sea stories", "seafaring", "voyages", "ships", "whaling") },
  { id: "travel-writing", label: "Travel writing", rule: subject("travel", "description and travel") },
  { id: "two-countries", label: "A story across two or more countries" },
  { id: "south-america-setting", label: "Set in South America", rule: subject("south america", "brazil", "argentina", "chile", "peru", "colombia") },
  { id: "africa-setting", label: "Set in Africa", rule: subject("africa", "nigeria", "kenya", "south africa", "ghana") },
  { id: "asia-setting", label: "Set in Asia", rule: subject("japan", "china", "india", "korea", "vietnam", "asia") },
  { id: "scandinavia-setting", label: "Set in Scandinavia", rule: subject("norway", "sweden", "denmark", "finland", "iceland", "scandinavia") },
  { id: "small-town", label: "Set in a small town" },
  { id: "train-journey", label: "A journey by train", rule: subject("railroad", "railway", "train") },
  { id: "immigrant-story", label: "An immigrant's story", rule: subject("immigrants", "emigration and immigration") },
  { id: "place-in-title", label: "A place in the title", rule: titleHas(PLACE_WORDS) },

  // Genre Hopper
  { id: "poetry", label: "Poetry", group: "poetry", rule: subject("poetry", "poems", "gedichte", "dikt") },
  { id: "science-fiction", label: "Science fiction", rule: subject("science fiction") },
  { id: "fantasy", label: "Fantasy", rule: subject("fantasy") },
  { id: "crime", label: "Crime or mystery", rule: subject("detective", "mystery", "crime", "murder", "krimi") },
  { id: "thriller", label: "Thriller", rule: subject("thriller", "suspense") },
  { id: "horror", label: "Horror", rule: subject("horror", "ghost stories", "supernatural") },
  { id: "romance", label: "Romance", rule: subject("romance", "love stories") },
  { id: "graphic-novel", label: "Graphic novel or comic", rule: subject("graphic novel", "comic", "comics") },
  { id: "essays", label: "Essays", rule: subject("essays") },
  { id: "short-stories", label: "Short stories", rule: subject("short stories") },
  { id: "biography", label: "Biography", group: "life", rule: subject("biography") },
  { id: "memoir", label: "Memoir", group: "life", rule: subject("memoir", "autobiography") },
  { id: "history", label: "History", rule: subject("history") },
  { id: "philosophy", label: "Philosophy", rule: subject("philosophy") },
  { id: "science", label: "Popular science", rule: subject("popular works", "science", "physics", "biology", "evolution") },
  { id: "nature-writing", label: "Nature writing", rule: subject("nature", "natural history", "ecology", "wildlife") },
  { id: "art-book", label: "A book about art", rule: subject("art", "artists", "painting", "painters") },
  { id: "music-book", label: "A book about music", rule: subject("music", "musicians") },
  { id: "food-book", label: "A book about food", rule: subject("cooking", "food", "cookery") },
  { id: "play", label: "A play", rule: subject("drama", "plays") },
  { id: "satire", label: "Satire", rule: subject("satire", "humorous", "humor", "humour") },
  { id: "childrens-classic", label: "A children's classic", rule: subject("children's fiction", "juvenile fiction", "children's stories") },
  { id: "young-adult", label: "Young adult", rule: subject("young adult") },
  { id: "true-crime", label: "True crime", rule: subject("true crime") },
  { id: "self-help", label: "A book that promises to improve you", rule: subject("self-help", "self-actualization", "success") },
  { id: "business", label: "Work or business", rule: subject("management", "business", "economics", "leadership") },
  { id: "politics", label: "Politics", rule: subject("politics", "political science") },
  { id: "religion-myth", label: "Myths or religion", rule: subject("mythology", "religion", "legends") },
  { id: "genre-never", label: "A genre you never read" },

  // Chunky & Tiny
  { id: "600-pages", label: "More than 600 pages", group: "long", rule: pagesAtLeast(601) },
  { id: "900-pages", label: "More than 900 pages", group: "very-long", rule: pagesAtLeast(901) },
  { id: "400-pages", label: "400 to 600 pages", group: "mid-long", rule: (b) => b.pages !== null && b.pages >= 400 && b.pages <= 600 },
  { id: "under-150", label: "Under 150 pages", group: "short", rule: pagesAtMost(149) },
  { id: "under-100", label: "Under 100 pages", group: "very-short", rule: pagesAtMost(99) },
  { id: "one-word-title", label: "A one-word title", rule: (b) => titleWords(b).length === 1 },
  { id: "long-title", label: "A title of seven words or more", rule: (b) => titleWords(b).length >= 7 },
  { id: "number-title", label: "A number in the title", rule: titleHas(NUMBERS) },
  { id: "colour-title", label: "A colour in the title", rule: titleHas(COLOURS) },
  { id: "animal-title", label: "An animal in the title", rule: titleHas(ANIMALS) },
  { id: "nature-title", label: "Weather or nature in the title", rule: titleHas(NATURE) },
  { id: "family-title", label: "A family member in the title", rule: titleHas(PEOPLE) },
  { id: "time-title", label: "A time of day or year in the title", rule: titleHas(TIME_WORDS) },
  { id: "question-title", label: "A question in the title", rule: titleHas(/\?/) },
  { id: "name-title", label: "A person's name in the title" },
  { id: "series-start", label: "First book in a series" },
  { id: "series-end", label: "Finish a series" },
  { id: "one-sitting", label: "Read in one sitting" },
  { id: "300-pages", label: "Around 300 pages", group: "mid", rule: (b) => b.pages !== null && b.pages >= 280 && b.pages <= 320 },
  { id: "title-a", label: "A title starting with A", rule: (b) => /^(the\s+)?a/i.test(b.title) },
  { id: "title-z", label: "A title with a Z, Q or X", rule: titleHas(/[zqx]/i) },
  { id: "two-word-title", label: "A two-word title", rule: (b) => titleWords(b).length === 2 },
  { id: "food-title", label: "Food or drink in the title", rule: titleHas(/\b(bread|wine|tea|coffee|apple|orange|lemon|honey|salt|sugar|milk|cake|soup|feast|dinner|supper|breakfast|brot|wein|kaffee|apfel|brød|vin|kaffe|eple)\b/i) },
  { id: "big-cover", label: "A hardback" },
  { id: "audiobook", label: "An audiobook" },
  { id: "tiny-font", label: "Tiny print, thin paper" },
  { id: "doorstop-month", label: "A book that took you a month" },

  // From My Shelves
  { id: "owned-year", label: "On your shelf for over a year", group: "tbr", rule: ownedForYears(1) },
  { id: "owned-five", label: "On your shelf for over five years", group: "tbr-long", rule: ownedForYears(5) },
  { id: "gift", label: "A book you were given" },
  { id: "second-hand", label: "Bought second-hand" },
  { id: "dustiest", label: "The dustiest book on your shelf" },
  { id: "borrowed", label: "Borrowed from a friend" },
  { id: "library-book", label: "From the library" },
  { id: "inscription", label: "A copy with an inscription" },
  { id: "top-shelf", label: "From the highest shelf" },
  { id: "bottom-shelf", label: "From the lowest shelf" },
  { id: "cover-buy", label: "Bought for the cover" },
  { id: "bookshop-holiday", label: "Bought on holiday" },
  { id: "recommended", label: "Recommended by a friend" },
  { id: "reread", label: "A reread" },
  { id: "abandoned-before", label: "One you gave up on before" },
  { id: "shortest-on-shelf", label: "The shortest unread book you own" },
  { id: "random-spine", label: "Close your eyes, pick a spine" },
  { id: "matching-cover", label: "A cover that matches your room" },
  { id: "unread-gift", label: "A gift you never got round to" },
  { id: "impulse-buy", label: "An impulse buy" },
  { id: "signed-copy", label: "A signed copy" },
  { id: "spine-colour", label: "The spine colour you have most of" },
  { id: "inherited", label: "A book you inherited" },
  { id: "from-snap", label: "One Readmoth found on a shelf photo" },
  { id: "owned-year-3", label: "On your shelf for over three years", group: "tbr-mid", rule: ownedForYears(3) },
  { id: "lent-back", label: "One that came back after lending it out" },
  { id: "bookplate", label: "Your oldest book" },

  // Voices
  { id: "author-of-colour", label: "An author of colour" },
  { id: "debut", label: "A debut" },
  { id: "woman-before-1900", label: "A woman writing before 1900" },
  { id: "indigenous-author", label: "An Indigenous author" },
  { id: "lgbtq-author", label: "An LGBTQ+ author or story", rule: subject("lgbt", "gay", "lesbian", "queer", "transgender") },
  { id: "disabled-author", label: "A disabled author or narrator" },
  { id: "under-30", label: "An author under 30 when it came out" },
  { id: "over-70", label: "An author over 70 when it came out" },
  { id: "initials", label: "An author who shares your initials" },
  { id: "banned", label: "A book banned somewhere", rule: subject("censorship", "banned") },
  { id: "prize-winner", label: "A prize winner", rule: subject("award", "prize", "winner") },
  { id: "two-authors", label: "Written by two or more people" },
  { id: "new-author", label: "An author you've never read" },
  { id: "favourite-author", label: "A favourite author" },
  { id: "dead-author", label: "An author who died before you were born" },
  { id: "small-press", label: "From an independent publisher" },
  { id: "translator-name", label: "One where you noticed the translator" },
  { id: "letters", label: "Letters or diaries", rule: subject("correspondence", "letters", "diaries") },
  { id: "unreliable", label: "An unreliable narrator" },
  { id: "working-class", label: "A working-class story" },
  { id: "elder-narrator", label: "A narrator over 60", rule: subject("older people", "aging", "old age") },
  { id: "child-narrator", label: "A child narrator" },
  { id: "neurodivergent", label: "A neurodivergent author or narrator", rule: subject("autism", "adhd", "neurodiversity") },
  { id: "refugee-story", label: "A refugee's story", rule: subject("refugees") },
  { id: "local-author", label: "An author from your country" },
  { id: "non-binary-author", label: "A non-binary author" },
  { id: "multiple-narrators", label: "Several narrators" },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export const FREE = "free";

export function category(id: string): Category | null {
  return BY_ID.get(id) ?? null;
}

const between = (from: string, to: string) => {
  const ids = CATEGORIES.map((c) => c.id);
  return ids.slice(ids.indexOf(from), ids.indexOf(to) + 1);
};

export const THEMES: Theme[] = [
  {
    id: "classic",
    name: "Classic Bingo",
    blurb: "A bit of everything: old and new, near and far, doorstops and slim ones.",
    categories: [
      "before-1700", "1800-1849", "1990s", "this-year", "century-old", "translated", "nordic-author", "african-author",
      "island-setting", "poetry", "science-fiction", "crime", "graphic-novel", "memoir", "nature-writing", "600-pages",
      "under-150", "colour-title", "animal-title", "owned-year", "gift", "second-hand", "author-of-colour", "debut",
      "prize-winner", "new-author", "reread", "recommended", "short-stories", "set-in-future", "number-title", "play",
    ],
  },
  { id: "time", name: "Time Traveller", blurb: "A square for every era, from before 1700 to this year.", categories: between("before-1700", "parents-era") },
  { id: "world", name: "Around the World", blurb: "Authors and settings from every corner of the map.", categories: between("translated", "place-in-title") },
  { id: "genre", name: "Genre Hopper", blurb: "Out of your comfort zone, one shelf at a time.", categories: between("poetry", "genre-never") },
  { id: "size", name: "Chunky & Tiny", blurb: "Doorstops, slim volumes and titles with a twist.", categories: between("600-pages", "doorstop-month") },
  { id: "shelves", name: "From My Shelves", blurb: "Read what you already own. Your to-read pile will thank you.", categories: between("owned-year", "bookplate") },
  { id: "voices", name: "Voices", blurb: "Read wider: whose stories, and who tells them.", categories: between("author-of-colour", "multiple-narrators") },
];

export function theme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

export type Rng = () => number;

/** A small seeded generator, so a card can be reproduced in tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CARD_SIZES = [3, 4, 5] as const;
export type CardSize = (typeof CARD_SIZES)[number];

/** Rows (and columns) of a card, from how many squares it has. */
export function cardSize(card: readonly string[]): CardSize {
  const n = Math.round(Math.sqrt(card.length));
  return (CARD_SIZES as readonly number[]).includes(n) && n * n === card.length ? (n as CardSize) : 5;
}

/** Odd cards have a free space in the middle; a 4×4 card has none. */
export function freeSquare(size: number): number | null {
  return size % 2 === 1 ? (size * size - 1) / 2 : null;
}

/** Squares that need a book. */
export function squaresToFill(card: readonly string[]) {
  return card.filter((id) => id !== FREE).length;
}

function pickFrom(pool: string[], taken: string[], rng: Rng): string | null {
  const usedGroups = new Set(taken.map((id) => category(id)?.group).filter(Boolean));
  const options = pool.filter((id) => !taken.includes(id) && !usedGroups.has(category(id)?.group ?? `#${id}`));
  if (options.length === 0) return null;
  return options[Math.floor(rng() * options.length)]!;
}

/** Different squares from the theme, no two from the same group, with a free middle on odd sizes. */
export function randomCard(themeId: ThemeId, size: CardSize = 5, rng: Rng = Math.random): string[] {
  const pool = theme(themeId).categories;
  // Top up from everything else if a theme is ever smaller than a card.
  const fallback = CATEGORIES.map((c) => c.id);
  const free = freeSquare(size);
  const card: string[] = [];
  for (let i = 0; i < size * size; i++) {
    if (i === free) {
      card.push(FREE);
      continue;
    }
    const id = pickFrom(pool, card, rng) ?? pickFrom(fallback, card, rng);
    if (!id) throw new Error("Not enough bingo categories");
    card.push(id);
  }
  return card;
}

/** Swaps one square for another from the same theme that isn't on the card yet. */
export function rerollSquare(card: string[], square: number, themeId: ThemeId, rng: Rng = Math.random): string[] {
  if (card[square] === undefined || card[square] === FREE) return card;
  const others = card.filter((_, i) => i !== square);
  const next = pickFrom(theme(themeId).categories, others, rng) ?? card[square]!;
  return card.map((id, i) => (i === square ? next : id));
}

/** A card is 9, 16 or 25 known, different category ids, with the free space in the middle of odd sizes. */
export function isValidCard(card: unknown): card is string[] {
  if (!Array.isArray(card) || !card.every((id) => typeof id === "string")) return false;
  const size = Math.round(Math.sqrt(card.length));
  if (!(CARD_SIZES as readonly number[]).includes(size) || size * size !== card.length) return false;
  const free = freeSquare(size);
  return (
    card.every((id, i) => (i === free ? id === FREE : BY_ID.has(id))) &&
    new Set(card).size === card.length
  );
}

/** Rows, columns and both diagonals of a square card. */
export function cardLines(size: number): number[][] {
  const idx = [...Array(size).keys()];
  return [
    ...idx.map((r) => idx.map((c) => r * size + c)),
    ...idx.map((c) => idx.map((r) => r * size + c)),
    idx.map((i) => i * size + i),
    idx.map((i) => i * size + (size - 1 - i)),
  ];
}

/** Complete lines, given the filled squares (a free middle always counts). */
export function completedLines(filled: Set<number>, size: number = 5): number[][] {
  const free = freeSquare(size);
  return cardLines(size).filter((line) => line.every((i) => i === free || filled.has(i)));
}

/** The theme a square's colour comes from: its own theme, not Classic, which borrows from all of them. */
export function categoryTheme(id: string): ThemeId | null {
  return THEMES.find((t) => t.id !== "classic" && t.categories.includes(id))?.id ?? null;
}

/** Squares on the card this book could fill, by rule. Squares without a rule are the reader's call. */
export function fittingSquares(card: string[], facts: BookFacts): number[] {
  return card.flatMap((id, i) => (category(id)?.rule?.(facts) ? [i] : []));
}
