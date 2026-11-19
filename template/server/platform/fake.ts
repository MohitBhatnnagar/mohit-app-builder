// Mohit platform: realistic dummy data for seed scripts. Do not edit.
// Deterministic: the same seed gives the same data, so screenshots are stable.
//   import { fake } from "./platform/fake.ts";
//   fake.fullName(), fake.int(1, 10), fake.pastDate(90), fake.pick(["a", "b"]) ...

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Aarav", "Olivia", "Liam", "Priya", "Noah", "Emma", "Mateo", "Sofia", "Lucas", "Mia", "Ethan", "Ava", "Arjun", "Isabella", "James", "Zara", "Leo", "Chloe", "Omar", "Hannah", "Kenji", "Amara", "Diego", "Freya", "Ravi", "Nora", "Samuel", "Leila", "Daniel", "Grace", "Ibrahim", "Elena", "Kai", "Maya", "Felix", "Anika", "Hugo", "Yuki", "Theo", "Sara", "Aaliyah", "Abdul", "Adaeze", "Adrian", "Aisha", "Akira", "Alejandro", "Alice", "Amelia", "Ananya", "Andre", "Angela", "Anton", "Astrid", "Ayaan", "Beatriz", "Benjamin", "Bilal", "Camila", "Carlos", "Caroline", "Chen", "Chiara", "Chidi", "Clara", "Connor", "Dalia", "Dmitri", "Eleanor", "Elias", "Emeka", "Emily", "Erik", "Esther", "Fatima", "Farah", "Gabriel", "Giulia", "Hana", "Hassan", "Henrik", "Hiroshi", "Imani", "Ines", "Isaac", "Ishaan", "Jasmine", "Javier", "Jin", "Joao", "Jonas", "Julia", "Kabir", "Karim", "Katarzyna", "Kavya", "Kofi", "Lars", "Laura", "Lena", "Lina", "Luca", "Lucia", "Mai", "Malik", "Marco", "Mariam", "Marta", "Matteo", "Mei", "Mohammed", "Nadia", "Naomi", "Nikhil", "Nina", "Oliver", "Oscar", "Pablo", "Paula", "Rafael", "Rania", "Rohan", "Rosa", "Ryan", "Sakura", "Santiago", "Sebastian", "Shreya", "Sienna", "Simone", "Sipho", "Soo-ah", "Tariq", "Thandiwe", "Tomas", "Valentina", "Victor", "Wei", "William", "Xavier", "Yara", "Yusuf", "Zainab", "Zoe"];
const LAST = ["Sharma", "Smith", "Garcia", "Chen", "Patel", "Johnson", "Müller", "Rossi", "Kim", "Nguyen", "Brown", "Silva", "Khan", "Williams", "Tanaka", "Jones", "Martin", "Kowalski", "Okafor", "Lopez", "Singh", "Andersson", "Dubois", "Haddad", "Novak", "Reyes", "Taylor", "Ivanova", "Mehta", "Clarke", "Abara", "Adeyemi", "Ahmed", "Alvarez", "Ansari", "Bakker", "Banerjee", "Becker", "Bianchi", "Campbell", "Castillo", "Chopra", "Cohen", "Costa", "Cruz", "Das", "Davies", "De Luca", "Diaz", "Edwards", "Eriksson", "Evans", "Fernandes", "Fischer", "Fitzgerald", "Fontaine", "Fujita", "Gonzalez", "Gupta", "Hansen", "Hernandez", "Hoffmann", "Hughes", "Iyer", "Jansen", "Jensen", "Kapoor", "Kaur", "Kelly", "Kumar", "Larsen", "Lee", "Lindberg", "Liu", "Mahmoud", "Malik", "Mendes", "Mensah", "Moreau", "Morales", "Murphy", "Nakamura", "Nair", "Nielsen", "Nowak", "O'Brien", "Ogunleye", "Olsen", "Ortiz", "Park", "Pereira", "Petrov", "Popescu", "Ramirez", "Rao", "Reddy", "Richter", "Rodriguez", "Romero", "Russo", "Saito", "Sato", "Schmidt", "Schneider", "Sokolov", "Suzuki", "Torres", "Tran", "Van der Berg", "Vasquez", "Wagner", "Walker", "Wang", "Weber", "Wilson", "Wong", "Wright", "Yamamoto", "Yilmaz", "Zhang", "Zhou"];
const COMPANY_A = ["North", "Blue", "Bright", "Iron", "Silver", "Green", "Swift", "Atlas", "Nova", "Summit", "Cedar", "Pixel", "Orbit", "Harbor", "Quantum", "Maple", "Vertex", "Lumen", "Apex", "Cobalt", "Granite", "Coral", "Falcon", "Willow", "Beacon", "Crimson", "Juniper", "Polar", "Sterling", "Aurora", "Redwood", "Meridian", "Horizon", "Echo", "Pioneer", "Evergreen", "Sapphire", "Keystone", "Lighthouse", "Oakridge"];
const COMPANY_B = ["Labs", "Systems", "Works", "Analytics", "Health", "Logistics", "Foods", "Studio", "Capital", "Robotics", "Energy", "Media", "Retail", "Software", "Partners", "Cloud", "Bio", "Motors", "Travel", "Learning", "Dynamics", "Networks", "Ventures", "Industries", "Solutions", "Design", "Security", "Pharma", "Logic", "Supply", "Brands", "Mobility"];
const SUBJECTS = ["The team", "Our client", "The customer", "Finance", "The vendor", "Leadership", "Support", "The design team", "Engineering", "Marketing", "The account manager", "Operations"];
const VERBS = ["reviewed", "approved", "asked about", "shared feedback on", "signed off on", "requested changes to", "is evaluating", "confirmed", "flagged a concern with", "wants a demo of", "followed up on", "scheduled a call about"];
const OBJECTS = ["the proposal", "the Q3 budget", "the onboarding plan", "pricing for next year", "the security questionnaire", "the latest invoice", "the product roadmap", "the contract terms", "the pilot results", "the delivery schedule", "the integration timeline", "the renewal quote", "the new dashboard", "the support SLA"];
const TAILS = ["", "", "", " this week", " before Friday", " after the meeting", " with two stakeholders", " and needs an answer soon", " ahead of the board review", " for the next quarter"];
const CITIES = ["London", "New York", "Mumbai", "Berlin", "Toronto", "Sydney", "Singapore", "Austin", "Paris", "Dubai", "Bengaluru", "Amsterdam", "Tokyo", "São Paulo", "Cape Town", "Dublin", "Seattle", "Madrid", "Stockholm", "Chicago"];
const WORDS = "the quick team shipped a new feature after reviewing customer feedback and data from last quarter while planning next steps for growth quality support pricing launch design research budget roadmap meeting report update project client order invoice delivery schedule review onboarding".split(" ");
const PRODUCT_ADJ = ["Classic", "Ultra", "Smart", "Eco", "Pro", "Mini", "Deluxe", "Organic", "Wireless", "Premium", "Compact", "Vintage"];
const PRODUCT_NOUN = ["Backpack", "Headphones", "Desk Lamp", "Water Bottle", "Sneakers", "Notebook", "Coffee Beans", "Yoga Mat", "Keyboard", "Sunglasses", "Wallet", "Plant Pot", "Jacket", "Blender", "Watch"];

export function createFake(seed = 42) {
  const r = mulberry32(seed);
  const int = (min: number, max: number) => Math.floor(r() * (max - min + 1)) + min;
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
  // Readable business sentences built from phrase templates (not word salad).
  const sentenceOf = (_n?: number) => `${pick(SUBJECTS)} ${pick(VERBS)} ${pick(OBJECTS)}${pick(TAILS)}.`;
  const DAY = 86400_000;
  const seen = new Set<string>();
  let uniqueCalls = 0, uniqueFallbacks = 0;
  const fake = {
    /** Number in [0, 1). */
    random: r,
    int,
    float: (min: number, max: number, decimals = 2) => Number((r() * (max - min) + min).toFixed(decimals)),
    bool: (probability = 0.5) => r() < probability,
    pick,
    /** pick with weights: fake.weighted({ open: 5, won: 2, lost: 1 }) */
    weighted: <K extends string>(weights: Record<K, number>): K => {
      const entries = Object.entries(weights) as [K, number][];
      let x = r() * entries.reduce((s, [, w]) => s + w, 0);
      for (const [k, w] of entries) if ((x -= w) < 0) return k;
      return entries[entries.length - 1][0];
    },
    /**
     * A weighted NUMBER, e.g. how many comments a task gets: fake.count({ 0: 3, 1: 3, 2: 2, 5: 1 }).
     * Compute it once before a loop; never call it inside a loop condition (it would re-roll every pass).
     */
    count: (weights: Record<number, number>): number => {
      const entries = Object.entries(weights);
      let x = r() * entries.reduce((s, [, w]) => s + w, 0);
      for (const [k, w] of entries) if ((x -= w) < 0) return Number(k);
      return Number(entries[entries.length - 1][0]);
    },
    /** n distinct items from arr. */
    sample: <T>(arr: readonly T[], n: number): T[] => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, n);
    },
    /**
     * A value never returned before by this unique() helper: fake.unique(fake.company).
     * Never loops forever: after 20 repeats it appends a number ("Nova Labs 2").
     */
    unique: (gen: () => string): string => {
      uniqueCalls++;
      for (let i = 0; i < 20; i++) {
        const v = gen();
        if (!seen.has(v)) return seen.add(v), v;
      }
      // Numbered fallbacks ("Nova Labs 7") look fake on screen: say so once the pool is clearly too small.
      if (++uniqueFallbacks === 25 && uniqueFallbacks > uniqueCalls * 0.05) {
        console.warn(`[fake] unique() had to add numbers to ${uniqueFallbacks} of ${uniqueCalls} values so far: the pool is too small. Widen the word lists, or drop uniqueness where it isn't needed (titles can repeat; make slugs unique instead).`);
      }
      const base = gen();
      let n = 2;
      while (seen.has(`${base} ${n}`)) n++;
      seen.add(`${base} ${n}`);
      return `${base} ${n}`;
    },
    firstName: () => pick(FIRST),
    lastName: () => pick(LAST),
    fullName: () => `${pick(FIRST)} ${pick(LAST)}`,
    /** Unique if you pass a unique index. */
    email: (name?: string, index?: number) =>
      `${(name ?? `${pick(FIRST)} ${pick(LAST)}`).toLowerCase().normalize("NFD").replace(/[^a-z ]/g, "").replace(/ +/g, ".")}${index ?? int(1, 9999)}@example.com`,
    company: () => `${pick(COMPANY_A)} ${pick(COMPANY_B)}`,
    city: () => pick(CITIES),
    phone: () => `+1 555 ${int(100, 999)} ${int(1000, 9999)}`,
    word: () => pick(WORDS),
    words: (n: number) => Array.from({ length: n }, () => pick(WORDS)).join(" "),
    /** A readable business sentence, e.g. "Finance approved the Q3 budget this week." */
    sentence: (_minWords?: number, _maxWords?: number) => sentenceOf(),
    paragraph: (sentences = 4) => Array.from({ length: sentences }, () => sentenceOf()).join(" "),
    title: () => {
      const s = Array.from({ length: int(2, 5) }, () => pick(WORDS)).join(" ");
      return s.replace(/\b\w/g, (c) => c.toUpperCase());
    },
    productName: () => `${pick(PRODUCT_ADJ)} ${pick(PRODUCT_NOUN)}`,
    price: (min = 5, max = 500) => Number((r() * (max - min) + min).toFixed(2)),
    color: () => `#${Math.floor(r() * 0xffffff).toString(16).padStart(6, "0")}`,
    uuid: () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const v = Math.floor(r() * 16);
      return (c === "x" ? v : (v & 0x3) | 0x8).toString(16);
    }),
    /** ISO timestamp up to `days` days ago. */
    pastDate: (days = 365) => new Date(Date.now() - r() * days * DAY).toISOString(),
    /** ISO timestamp up to `days` days ahead. */
    futureDate: (days = 90) => new Date(Date.now() + r() * days * DAY).toISOString(),
    /** YYYY-MM-DD, `daysAgo` days before today. */
    day: (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10),
    /** YYYY-MM-DD in the server's LOCAL time zone (what a user calls "today"), `daysAgo` days before today.
     *  Use for apps keyed by calendar day (habits, diaries, rotas); `day` is UTC and is off by one near midnight. */
    localDay: (daysAgo = 0) => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    },
    /** SQLite datetime text ("YYYY-MM-DD HH:MM:SS") up to `days` ago, matches datetime('now') columns. */
    sqlDate: (days = 365) => new Date(Date.now() - r() * days * DAY).toISOString().slice(0, 19).replace("T", " "),

    // ---- Realistic time and volume (the shapes seeds most often get wrong) ----
    /** SQLite datetime text for a timestamp in ms: fake.sql(Date.now() - 3 * 864e5). */
    sql: (t: number) => new Date(t).toISOString().slice(0, 19).replace("T", " "),
    /**
     * A moment between `from` and `to` (ms), never in the future. Options: hours [start, end) in UTC, e.g. [9, 17]
     * for working hours; weekdays: true for Mon–Fri only. Returns null if the window is entirely in the future.
     */
    when: (from: number, to: number, opts: { hours?: [number, number]; weekdays?: boolean } = {}): number | null => {
      const end = Math.min(to, Date.now());
      if (end <= from) return null;
      for (let tries = 0; tries < 30; tries++) {
        let t = from + r() * (end - from);
        if (opts.hours) {
          const d = new Date(t);
          const [h0, h1] = opts.hours;
          d.setUTCHours(h0, 0, 0, 0);
          t = +d + r() * (h1 - h0) * 3600_000;
        }
        const dow = new Date(t).getUTCDay();
        if (opts.weekdays && (dow === 0 || dow === 6)) continue;
        if (t >= from && t <= end) return Math.floor(t / 1000) * 1000;
      }
      return null;
    },
    /**
     * n timestamps (ms, sorted, all in the past) spread over the last `days` days with a realistic shape:
     * growth: the last month has `growth`× the volume of the first (1 = flat, 1.5 = a growing business);
     * season: 12 monthly multipliers (Jan..Dec); hours/weekdays as in fake.when.
     */
    spread: (n: number, days: number, opts: { growth?: number; season?: number[]; hours?: [number, number]; weekdays?: boolean } = {}): number[] => {
      const growth = opts.growth ?? 1.3;
      const start = Date.now() - days * DAY;
      const out: number[] = [];
      for (let guard = 0; out.length < n && guard < n * 50; guard++) {
        // Linear ramp from 1 to `growth` by rejection sampling, then seasonality.
        const x = r();
        const weight = (1 + (growth - 1) * x) / Math.max(1, growth);
        const t0 = start + x * days * DAY;
        const season = opts.season ? opts.season[new Date(t0).getUTCMonth()] / Math.max(...opts.season) : 1;
        if (r() > weight * season) continue;
        const t = fake.when(t0 - 12 * 3600_000, t0 + 12 * 3600_000, opts);
        if (t !== null && t >= start) out.push(t);
      }
      return out.sort((a, b) => a - b);
    },
    /**
     * A status that fits the item's age: fake.byAge(ageDays, [[2, { new: 3, open: 1 }], [30, { open: 2, done: 5 }], [Infinity, { done: 9, lost: 1 }]]).
     * Each band applies up to that many days old. Stops old work from staying "open" forever and new work from being "done".
     */
    byAge: <K extends string>(ageDays: number, bands: [number, Record<K, number>][]): K => {
      const band = bands.find(([upTo]) => ageDays <= upTo) ?? bands[bands.length - 1];
      return fake.weighted(band[1]);
    },
    /**
     * How many people want something that holds `capacity`, given its popularity (0 = nobody, 1 = exactly full,
     * 1.3 = a waitlist). Use it instead of drawing demand from the whole user base, which overfills popular things.
     */
    demand: (capacity: number, popularity: number) => Math.max(0, Math.round(capacity * popularity * (0.8 + r() * 0.4))),
  };
  return fake;
}

export const fake = createFake();
