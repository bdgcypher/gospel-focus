/**
 * The app's map of itself.
 *
 * Every destination the app knows about is described here once — where it
 * lives, what it is for, and whether it is built yet — and the navigation, the
 * home hub, and the section pages are all rendered from this list. That is
 * deliberate: a link that exists in the nav and a card that exists on the home
 * screen can't drift apart, and adding a feature is a single entry rather than
 * an edit in five places.
 *
 * `status` is the honest bit. "ready" pages are real; "planned" pages render
 * the placeholder shell (components/feature-page.tsx), which shows what the
 * feature will do and says plainly that it isn't built.
 */

import type { Metadata } from "next";

export type IconName =
  | "home"
  | "book"
  | "cards"
  | "search"
  | "map"
  | "sparkles"
  | "quiz"
  | "puzzle"
  | "letters"
  | "word"
  | "word-search"
  | "grid"
  | "palette"
  | "lock"
  | "journal"
  | "widget"
  | "bookmark"
  | "gear"
  | "chart"
  | "flame";

/**
 * How the home screen groups its cards. The order here is the order the
 * sections appear in.
 */
export type GroupId = "read" | "study" | "games" | "focus" | "shelf";

export interface FeatureGroup {
  id: GroupId;
  /** The heading on the home screen. */
  label: string;
  /** One line under it, so a section explains itself. */
  blurb: string;
  /** The page that holds the whole section, when there is one. */
  hubHref?: string;
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: "read",
    label: "Random Scripture",
    blurb: "Flip open the scriptures and find inspiration!",
  },
  {
    id: "study",
    label: "Study",
    blurb: "Tools for taking the words with you",
    hubHref: "/study",
  },
  {
    id: "games",
    label: "Games",
    blurb: "Play with what you know",
    hubHref: "/games",
  },
  {
    id: "focus",
    label: "Focus",
    blurb: "Make room for the quiet part",
  },
  {
    id: "shelf",
    label: "Your Library",
    blurb: "What the app has kept for you",
  },
];

export type FeatureStatus = "ready" | "planned";

export interface Feature {
  id: string;
  group: GroupId;
  href: string;
  title: string;
  /**
   * The heading a compact tile shows, where the full title is a mouthful in a
   * two-column grid. Falls back to `title`, so only the long ones need it.
   */
  tileTitle?: string;
  /** The page's one line: the card's summary, and the line under a page heading. */
  blurb: string;
  /**
   * The card's one line where a compact tile needs a shorter one than the page
   * itself can use — a half-width column in a two-column grid carries about a
   * dozen words, and the heading above it is already saying what the page is.
   * Falls back to `blurb`, so only the long ones need it.
   */
  tileBlurb?: string;
  icon: IconName;
  status: FeatureStatus;
  /**
   * What the page does, or will do. Shown as a list on a placeholder so the
   * reader can see the shape of the thing rather than a bare "coming soon".
   */
  capabilities: string[];
}

export const FEATURES: Feature[] = [
  {
    id: "picker",
    group: "read",
    href: "/read",
    title: "Random Passage",
    blurb: "One tap draws a verse or a conference paragraph",
    icon: "book",
    status: "ready",
    capabilities: [
      "Draws from the standard works, general conference, or any mix of books",
      "The page-riffle animation settles onto the draw",
      "Expands the whole chapter or talk with the verse you landed on highlighted",
      "Saves and shares any passage — or a run of verses — as an image",
      "Opens the passage in the Gospel Library app",
    ],
  },
  {
    id: "widget",
    group: "read",
    href: "/widgets",
    title: "Home-Screen Widgets",
    tileTitle: "Widgets",
    blurb: "Verse of the day, streak, and a one-tap draw",
    icon: "widget",
    status: "planned",
    capabilities: [
      "Shows the verse of the day, the active recitation, and the streak counter",
      "A launcher button that opens straight into the riffle animation",
      "Built as native Android widgets over the Capacitor bridge, with iOS later",
    ],
  },
  {
    id: "search",
    group: "study",
    href: "/search",
    title: "Search",
    tileTitle: "Search",
    blurb: "Look up a passage with keywords, phrases, or a reference",
    tileBlurb: "Find a word or phrase",
    icon: "search",
    status: "ready",
    capabilities: [
      "Every verse and conference paragraph at once, from the same text the app reads offline",
      "A phrase finds the verse it came from, and a reference like “alma 32” finds the chapter",
      "Opens the passage in the reader, ready to expand, favorite, or share",
    ],
  },
  {
    id: "memorize",
    group: "study",
    href: "/memorize",
    title: "Memorize",
    tileTitle: "Memorize",
    blurb: "Hide the words a few at a time, then say it whole",
    tileBlurb: "Improve your scripture recall",
    icon: "cards",
    status: "ready",
    capabilities: [
      "Word hiding: step a passage's words out of sight one at a time, from the top or scattered",
      "Flashcards: two-sided cards — the citation and the words — started on whichever face you choose",
      "Recalling the words from the citation, or the citation from the words, with first letters as the hint",
      "Your memory list, filled from a draw, today's verse, or several saved passages at once",
      "Every recitation logged with the day it happened",
    ],
  },
  {
    id: "journal",
    group: "study",
    href: "/journal",
    title: "Journal & Notes",
    blurb: "Your own words, kept beside the verses",
    tileBlurb: "Jot down thoughts and feelings",
    icon: "journal",
    status: "ready",
    capabilities: [
      "Entries written by typing or by dictation, titled and kept offline",
      "Bold, italic, underline, lists, and links, with the usual keyboard shortcuts",
      "Links to a passage in the library, a note you wrote, or another entry",
      "A note on any saved passage, written from the reader or from favorites",
    ],
  },
  {
    id: "reference-quiz",
    group: "games",
    href: "/games/reference-quiz",
    title: "What's That Verse?",
    blurb: "Recognize or guess a verses reference",
    icon: "quiz",
    status: "ready",
    capabilities: [
      "Four hint stages: volume, then book, then chapter, then the verse itself",
      "Hints cost gems, from one for the volume to fifteen for the verse",
      "Searchable dropdowns to answer without typing",
    ],
  },
  {
    id: "wordle",
    group: "games",
    href: "/games/puzzle",
    title: "Daily Puzzle",
    tileTitle: "Daily Puzzle",
    blurb: "Six tries to guess a word from today's chapter",
    icon: "word",
    status: "ready",
    capabilities: [
      "A four-to-six-letter word drawn from the day's featured chapter",
      "Six guesses, with letter and position marked on the tiles",
      "One puzzle a day, a result card with the verse, and endless practice rounds",
    ],
  },
  {
    id: "word-search",
    group: "games",
    href: "/games/word-search",
    title: "Word Search",
    tileTitle: "Word Search",
    blurb: "Find words from a selected scripture",
    icon: "word-search",
    status: "ready",
    capabilities: [
      "The passage's own significant words, hidden in a letter grid",
      "Drag across the grid to select, on touch or with a mouse",
      "A fresh grid for every passage you draw",
    ],
  },
  {
    id: "focus-lock",
    group: "focus",
    href: "/focus",
    title: "Focus Lock",
    tileTitle: "App Lock & Blocker",
    blurb: "Block distracting apps until gospel study is done",
    icon: "lock",
    status: "ready",
    capabilities: [
      "Set it up in one step, then see at a glance whether it is locked",
      "Pick the apps to disable from the ones installed on your phone",
      "The day's study releases them — the minutes read against your daily goal",
      "One switch for the lock, and it asks before it lets you off: 15 minutes, 30 minutes, or the rest of the day, then it closes itself again",
      "A lock screen over the chosen apps until that happens",
      "Needs Android's accessibility access; it sees which app is in front and reads nothing on the screen",
      "Android only — iOS waits for Screen Time",
    ],
  },
  {
    id: "favorites",
    group: "shelf",
    href: "/favorites",
    title: "Favorites",
    blurb: "Every passage you have bookmarked",
    icon: "bookmark",
    status: "ready",
    capabilities: [
      "Bookmark any passage, or a whole run of verses",
      "Kept on the device, newest first",
      "Export to a file, and import it back",
    ],
  },
  {
    id: "streak",
    group: "shelf",
    href: "/streak",
    title: "Streak",
    blurb: "The days in a row, and the freezes that protect them",
    tileBlurb: "Your run, and your freezes",
    icon: "flame",
    status: "ready",
    capabilities: [
      "The current run of days, greyed out until today's goal is met",
      "A horizontal strip of recent days: the goal was met, a freeze covered it, or it was missed",
      "Streak freezes, which keep the run alive through one missed day each",
      "Refill freezes with gems when the two you can hold run out",
    ],
  },
  {
    id: "stats",
    group: "shelf",
    href: "/stats",
    title: "Stats & Progress",
    tileTitle: "Stats",
    blurb: "Streaks, passages, cards, and time studied",
    icon: "chart",
    status: "ready",
    capabilities: [
      "The current run of days, the best one, and every day counted",
      "Passages read, daily word puzzles solved, flashcards recited, and passages bookmarked",
      "Minutes studied today against the daily goal, and the days it was met",
    ],
  },
  {
    id: "settings",
    group: "shelf",
    href: "/settings",
    title: "Settings",
    blurb: "Theme and style, motion, streak, and the daily reminder",
    icon: "gear",
    status: "ready",
    capabilities: [
      "Light, dark, or follow the system",
      "Reduce motion, which skips the riffle",
      "The daily study reminder and its time of day",
      "Favorites backup: export and import",
    ],
  },
];

/** The pages a group covers, in the order they are listed. */
export const featuresInGroup = (group: GroupId) => FEATURES.filter((f) => f.group === group);

/** A section's own heading and blurb, for its hub page. */
export const groupById = (id: GroupId) => FEATURE_GROUPS.find((g) => g.id === id);

/** One feature by id, looked up from the catalog. */
export const featureById = (id: string) => FEATURES.find((f) => f.id === id);

/**
 * A page's metadata, taken from the same catalog entry the page renders, so a
 * tab title and the card that led to it can't disagree.
 *
 * Deliberately in this module rather than beside the page component: a function
 * exported from a "use client" module is a client reference, and calling one
 * from a server component throws. This file is plain data, so both sides can
 * have it.
 */
export function featureMetadata(id: string): Metadata {
  const feature = featureById(id);
  return {
    title: feature ? `${feature.title} · Gospel Focus` : "Gospel Focus",
    description: feature?.blurb,
  };
}

/**
 * The destinations in the bottom bar and the top bar, in tab order.
 *
 * Four sections, and each label is the section's own heading read back out of
 * FEATURE_GROUPS rather than written again here — a tab and the page it opens
 * onto say the same thing by construction, which is not true of two lists that
 * only look alike.
 *
 * Four sections is the ceiling, not a coincidence: the bottom bar is a row of
 * equal targets across a phone, and each one added squeezes every label. Reading
 * is deliberately not a tab — it is what the app opens onto, so the hub's verse
 * of the day and the Study page both lead there, and the bar is left to the
 * sections a reader moves between. On a phone the bar carries exactly one entry
 * beyond those four, and it is not a section at all: "More", which opens the
 * menu (see components/nav-bar.tsx). Everything else lives on the hub's four
 * tiles, on the section pages they and the tabs open onto, and in that menu.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

/** A section's heading, for the tab that opens it. */
const sectionLabel = (id: GroupId) => groupById(id)?.label ?? "";

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/study", label: sectionLabel("study"), icon: "book" },
  { href: "/games", label: sectionLabel("games"), icon: "puzzle" },
  { href: "/focus", label: sectionLabel("focus"), icon: "lock" },
];

/** A path without its trailing slash, so "/memorize/" and "/memorize" agree. */
const withoutSlash = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);

/**
 * The sections a study session runs in: reading, and the tools that study with
 * it.
 *
 * Named as sections rather than listed as pages, because reading answers to one
 * catalog entry and memorization to another — a hand-kept list of hrefs here
 * would be a second place for the same fact to live, and the two would drift the
 * first time a tool moved. Planned features are left out: a placeholder page is
 * not somewhere a reader can study yet.
 */
const STUDY_GROUPS: GroupId[] = ["read", "study"];

/**
 * Whether the study timer runs on this path by itself.
 *
 * True for the study section's hub as well, which is a group rather than a
 * feature and so has no catalog entry of its own.
 */
export function isStudyPath(pathname: string): boolean {
  const here = withoutSlash(pathname);
  if (here === "/study") return true;
  return FEATURES.some(
    (feature) =>
      feature.status === "ready" &&
      STUDY_GROUPS.includes(feature.group) &&
      (here === feature.href || here.startsWith(`${feature.href}/`))
  );
}

/**
 * Whether a nav entry should look current for this path.
 *
 * A section owns everything beneath it, so /games/reference-quiz keeps "Games"
 * lit — and it also owns the pages it gathers, which are not beneath its own
 * path: /memorize belongs to Study even though it is not /study/memorize. Which
 * pages those are comes from the catalog, so a tab lights for what it really
 * holds rather than for what its URL happens to prefix. The home entry is
 * exact — "/" is a prefix of every path, and lighting Home everywhere would say
 * nothing.
 */
export function isNavActive(pathname: string, href: string): boolean {
  const here = withoutSlash(pathname);
  const target = withoutSlash(href);
  if (target === "/") return here === "/";
  if (here === target || here.startsWith(`${target}/`)) return true;

  const section = FEATURE_GROUPS.find((group) => group.hubHref === target);
  if (!section) return false;
  return featuresInGroup(section.id).some(
    (feature) => here === feature.href || here.startsWith(`${feature.href}/`)
  );
}

/**
 * Whether this path is one of the four sections themselves.
 *
 * Narrower than `isNavActive` on purpose. A tool under a tab — /memorize under
 * Study, a game under Games — still lights that tab up, but it is its own page
 * reached from a card, not a place the bar can take you. Only the bar's own
 * destinations slide between each other; everything else arrives with the
 * quieter fade (see components/app-shell.tsx and the "Changing pages" rules in
 * app/globals.css).
 */
export function isNavPage(pathname: string): boolean {
  const here = withoutSlash(pathname);
  return PRIMARY_NAV.some((item) => item.href === here);
}

/**
 * Which way along the bar a link sits from here, for the entrance that follows.
 *
 * Left to right is the order of the bar itself: a section further along than
 * the current one is ahead, and one behind it is back. Arriving from a page
 * that is not in the bar (a settings screen, a tool inside a section) there is
 * no current section to measure from, so Home is treated as the way back and
 * everything else as forward. A link to the page already on screen returns
 * nothing: there is nothing to animate.
 */
export type NavDirection = "forward" | "back";

export function navDirection(pathname: string, href: string): NavDirection | null {
  const to = PRIMARY_NAV.findIndex((item) => item.href === href);
  if (to < 0) return null;

  const from = PRIMARY_NAV.findIndex((item) => isNavActive(pathname, item.href));
  if (from < 0) return href === "/" ? "back" : "forward";
  if (from === to) return null;

  return to > from ? "forward" : "back";
}
