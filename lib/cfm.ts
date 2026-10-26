/**
 * Come, Follow Me: the chapters this week's lesson asks the reader to study.
 *
 * The schedule is built with the data (scripts/build-cfm.mjs) and fetched here,
 * so nothing at runtime asks the Church's site for anything: the app can be
 * offline, which the Android build always is.
 *
 * A week is a date range, not a week number: the manual's first week starts in
 * December of the year before, and Easter and Christmas move, so the dates are
 * the only honest way to ask "which week is this day in?". The lookups are
 * cached per year, so a hub, a reminder sync and a puzzle asking about the same
 * month cost one fetch between them.
 *
 * A day outside every shipped week — a year the build does not know, or one of
 * the weeks the manual gives no reading (the introduction, Easter, Christmas) —
 * resolves to null, and the caller draws the way it always did. That is a state
 * the app has to handle anyway, so it is not an error here.
 */
import { dataUrl } from "./data-url";

export interface CfmReading {
  /** Volume id in this app's library, e.g. "ot". */
  volume: string;
  /** Book slug in this app's library, e.g. "jer". */
  book: string;
  /** The chapters asked for, in order, at least one. */
  chapters: number[];
}

export interface CfmWeek {
  /** The week's number in the manual, for a label if one is ever needed. */
  number: number;
  /** First day, inclusive, as "YYYY-MM-DD". */
  start: string;
  /** Last day, inclusive. */
  end: string;
  /** The reading as the manual writes it, e.g. "Jeremiah 1–3; 7; 16–18; 20". */
  label: string;
  readings: CfmReading[];
}

export interface CfmYear {
  year: number;
  manual: { title: string; course?: string; uri: string; url: string };
  weeks: CfmWeek[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** One fetch per year, however many days ask about it. */
const years = new Map<number, Promise<CfmYear | null>>();

function parseWeek(value: unknown): CfmWeek | null {
  if (!value || typeof value !== "object") return null;
  const week = value as Partial<CfmWeek>;
  if (typeof week.start !== "string" || !DAY.test(week.start)) return null;
  if (typeof week.end !== "string" || !DAY.test(week.end)) return null;
  if (typeof week.label !== "string") return null;
  if (!Array.isArray(week.readings)) return null;

  const readings: CfmReading[] = [];
  for (const entry of week.readings) {
    if (!entry || typeof entry !== "object") continue;
    const reading = entry as Partial<CfmReading>;
    if (typeof reading.volume !== "string" || typeof reading.book !== "string") continue;
    if (!Array.isArray(reading.chapters)) continue;
    const chapters = reading.chapters
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1);
    if (!chapters.length) continue;
    readings.push({ volume: reading.volume, book: reading.book, chapters });
  }

  return {
    number: typeof week.number === "number" ? week.number : 0,
    start: week.start,
    end: week.end,
    label: week.label,
    readings,
  };
}

function parseYear(value: unknown): CfmYear | null {
  if (!value || typeof value !== "object") return null;
  const file = value as Partial<CfmYear>;
  if (typeof file.year !== "number" || !Array.isArray(file.weeks)) return null;
  const manual = file.manual && typeof file.manual === "object" ? file.manual : { title: "", uri: "", url: "" };

  const weeks: CfmWeek[] = [];
  for (const entry of file.weeks) {
    const week = parseWeek(entry);
    if (week) weeks.push(week);
  }

  return {
    year: file.year,
    manual: {
      title: typeof manual.title === "string" ? manual.title : "",
      course: typeof manual.course === "string" ? manual.course : undefined,
      uri: typeof manual.uri === "string" ? manual.uri : "",
      url: typeof manual.url === "string" ? manual.url : "",
    },
    weeks,
  };
}

/**
 * A year's schedule, or null when this build does not ship it.
 *
 * A missing file is an ordinary answer — the next year's manual may not be out
 * yet — so a 404 and a broken fetch are both "no schedule", cached along with
 * the answer so a day outside the data does not ask again on every render.
 */
export function loadCfmYear(year: number): Promise<CfmYear | null> {
  let loaded = years.get(year);
  if (!loaded) {
    loaded = fetch(dataUrl(`data/cfm/${year}.json`))
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
      .then(parseYear)
      .catch(() => null);
    years.set(year, loaded);
  }
  return loaded;
}

/** The week containing `day`, or null. `day` may carry a seed suffix. */
export async function weekFor(day: string): Promise<CfmWeek | null> {
  const key = day.slice(0, 10);
  if (!DAY.test(key)) return null;

  const year = Number(key.slice(0, 4));
  // The manual's first week usually begins in December of the year before, so a
  // January date can belong to the previous year's file — and a late-December
  // date belongs to the next year's.
  for (const candidate of [year - 1, year, year + 1]) {
    const schedule = await loadCfmYear(candidate);
    const week = schedule?.weeks.find((entry) => entry.start <= key && key <= entry.end);
    if (week) return week;
  }
  return null;
}
