import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { useEffect, useRef } from "react";

/**
 * The app's hands.
 *
 * Everything is a no-op outside the native shell: a phone's browser may or may
 * not expose the vibration API, and a tap is not something to rattle a desktop
 * with. Every call is also fire-and-forget — haptics are decoration, so a
 * device without a vibrator (or with haptics switched off) should never be able
 * to break what the reader is doing.
 *
 * One pulse is an impact — the plugin's three weights, which a device is free
 * to interpret in its own hardware — or a buzz of a stated length. A *pattern*
 * is several of them in a row, and the plugin has no way to play one: every
 * call is a single pulse, and on Android the next pulse cuts short whatever is
 * still running. So the beats of a pattern are scheduled here, spaced further
 * apart than the pulse before them lasts. A new pattern takes over from where
 * it starts — the celebration for a finished board is the last thing a reader
 * wants to hear twice — and leaves whatever was already owed before then.
 */
const enabled = () => Capacitor.isNativePlatform();

async function impact(style: ImpactStyle): Promise<void> {
  if (!enabled()) return;
  try {
    await Haptics.impact({ style });
  } catch {
    // No vibrator, or haptics unavailable — nothing to do.
  }
}

/** One continuous buzz, in milliseconds — the plugin's one measured pulse. */
async function buzz(ms: number): Promise<void> {
  if (!enabled()) return;
  try {
    await Haptics.vibrate({ duration: ms });
  } catch {
    // Ignore.
  }
}

interface Beat {
  /** Milliseconds after the pattern begins. */
  at: number;
  style?: ImpactStyle;
  /** A continuous buzz of this many milliseconds, instead of an impact. */
  buzz?: number;
}

/** The beats still owed, with the time each is due, so a new pattern can take over. */
let scheduled: { due: number; timer: number }[] = [];

/**
 * Play a set of beats.
 *
 * `after` delays the whole pattern, for a pattern that belongs to a second
 * event: the celebration for a board starts when the line that won it has
 * finished being drawn, rather than on top of it.
 *
 * A pattern takes over from the moment it starts — whatever the last one still
 * owed from then on is dropped — but the beats it owes *before* then are left
 * to play. That is the case a board's last word makes: its cross-out is a buzz
 * and a bump, and the card that opens with it asks for its fanfare four
 * hundred milliseconds later. Clearing everything on the way in would take the
 * cross-out away and play the party over the place it should have been.
 */
function pattern(beats: Beat[], after = 0): void {
  if (!enabled()) return;
  const now = performance.now();
  const start = now + after;
  scheduled = scheduled.filter((beat) => {
    if (beat.due < start) return true;
    window.clearTimeout(beat.timer);
    return false;
  });
  for (const beat of beats) {
    const due = start + beat.at;
    // A beat that is due now is played here rather than handed to a timer: a
    // card mounting can hold the main thread long enough that a zero-delay
    // timer lands with the *next* beat, and the fanfare then opens on one long
    // buzz instead of two short ones.
    if (due <= now) {
      pulse(beat);
      continue;
    }
    // The entry takes itself out when it lands, so a long session's list is
    // only ever the beats still owed.
    const entry = { due, timer: 0 };
    entry.timer = window.setTimeout(() => {
      scheduled = scheduled.filter((other) => other !== entry);
      pulse(beat);
    }, due - now);
    scheduled.push(entry);
  }
}

function pulse(beat: Beat): void {
  void (beat.style ? impact(beat.style) : buzz(beat.buzz ?? 0));
}

/** One page turning over: the lightest tick the device offers. */
export async function tapPageTurn(): Promise<void> {
  await impact(ImpactStyle.Light);
}

/**
 * The section mark coming away from the link it was on.
 *
 * One tick, the same weight as a page turning over, at the moment the highlight
 * lets go of the words it has been under and starts across the bar. The bar's
 * mark holds its trailing edge for a moment before it snaps across
 * (components/nav-bar.tsx), and that moment is the whole gesture's beat — a
 * finger feels it land even when the eye is on the page that is moving.
 */
export async function tapSectionSnap(): Promise<void> {
  await impact(ImpactStyle.Light);
}

/** The book coming to rest on the drawn passage. */
export async function tapBookLanded(): Promise<void> {
  await impact(ImpactStyle.Medium);
}

/**
 * A press that lands: every button and link in the app.
 *
 * The same tick a page turn gets, because it is the same thing — a finger
 * touches a thing and the thing answers. It is put here rather than in each
 * control so that a button added tomorrow has a feel without being told to
 * (components/press-feedback.tsx keeps the one listener).
 */
export async function tapControl(): Promise<void> {
  await impact(ImpactStyle.Light);
}

/**
 * One letter of a word-search line, as the finger reaches it.
 *
 * The letters of a drag are the game's own rhythm — the closest thing this app
 * has to a finger running along a page — so each one ticks, and a drag down a
 * long word plays as a run of small taps rather than as one hum.
 */
export async function tapLetter(): Promise<void> {
  await impact(ImpactStyle.Light);
}

/**
 * The drag turning a corner: across to down, or down to a diagonal.
 *
 * A weight above the letters, so a turn is felt as a turn rather than as one
 * more letter. It is not a heavier tap for its own sake: the line the finger is
 * on has just changed out from under it, and the hand should know before the
 * eye does.
 */
export async function tapDirectionChange(): Promise<void> {
  await impact(ImpactStyle.Medium);
}

/**
 * How long a found word's line takes to draw itself
 * (components/word-search-page.tsx). Exported because the celebration that
 * follows it waits for it.
 */
export const CROSS_OUT_MS = 400;

/**
 * A word found: the pen starting across it, and one bump where it lands.
 *
 * The long buzz is the stroke being drawn and the bump is its far end, so the
 * two together cover the cross-out's own animation rather than playing over
 * it — the hand finishes exactly when the line does.
 */
export function tapWordFound(): void {
  pattern([
    { at: 0, buzz: 220 },
    { at: 250, style: ImpactStyle.Light },
  ]);
}

/**
 * A line that spelled nothing: two quick buzzes, in a row and then gone.
 *
 * Not a scolding — the board drops a wrong line without a mark on it — so the
 * pair is short and the same weight as a letter. It says "that was not one"
 * once and lets the reader keep looking.
 */
export function tapLineMissed(): void {
  pattern([
    { at: 0, style: ImpactStyle.Medium },
    { at: 90, style: ImpactStyle.Medium },
  ]);
}

/** The six beats of a win, and the two of a near miss — see the cards below. */
const GREAT_WORK: Beat[] = [
  { at: 0, style: ImpactStyle.Light },
  { at: 100, style: ImpactStyle.Light },
  { at: 210, buzz: 200 },
  { at: 440, style: ImpactStyle.Light },
  { at: 540, style: ImpactStyle.Medium },
  { at: 640, style: ImpactStyle.Light },
];

const NOT_QUITE: Beat[] = [
  { at: 0, style: ImpactStyle.Light },
  { at: 110, style: ImpactStyle.Medium },
];

/**
 * The "Great work" card: short, short, long, short, medium, short.
 *
 * Six beats rather than one because the card is the end of something — a board
 * finished, a word found, a verse named — and a single buzz cannot say that.
 * The long beat in the middle is the moment the card arrives; the three after
 * it are the reader's own satisfaction, settling.
 */
export function tapGreatWork(after = 0): void {
  pattern(GREAT_WORK, after);
}

/**
 * The "Not quite" card: short, then medium.
 *
 * Two beats, and the second one heavier: the shape of a shrug. It is the same
 * card in every game — the daily puzzle's lost round, the quiz's third wrong
 * guess — because a near miss should sound the same wherever it happens.
 */
export function tapNotQuite(after = 0): void {
  pattern(NOT_QUITE, after);
}

/**
 * A game's ending, played once when its card opens.
 *
 * Hung off the card rather than off the move that won, because the card is what
 * the reader is looking at: a result sheet that is already open when a round
 * ends (a reload, a reopened dismissal) still gets the same answer when it
 * appears, and one that stays open does not play again on every re-render. The
 * ref is the guard rather than an empty dependency list, which is what the
 * lint rule wants and what a card that changes its mind — a re-draw landing
 * after a dismissal — actually needs.
 *
 * `after` is for a card that arrives on the back of an animation: the word
 * search's cross-out is still being drawn when its card opens.
 */
export function useResultHaptics(won: boolean, after = 0): void {
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    pattern(won ? GREAT_WORK : NOT_QUITE, after);
  }, [won, after]);
}
