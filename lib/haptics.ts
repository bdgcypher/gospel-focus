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

/** Whether iOS's selection generator has been prepared for this session. */
let selectionOpen = false;

/**
 * How long a soft pulse lasts on Android, in milliseconds.
 *
 * Android's LIGHT impact is fifty milliseconds at an amplitude of about a
 * hundred and ten out of two hundred and fifty-five — a small buzz, and one a
 * hand reads as an event rather than as a tick. The system's own key taps are
 * far shorter than that, which is why a page of buttons that all knock felt
 * louder than the keyboard it was being compared to. A measured pulse of ten
 * milliseconds has roughly half the punch of LIGHT and lands as a short tap:
 * enough to know the press happened, not enough to hear it. The slightly longer
 * one is for a page coming to rest, the one navigation beat worth a little
 * more than a tick.
 */
const SOFT_MS = 10;
const FIRM_MS = 18;

/**
 * The softest tick there is: the detent a picker makes as it slides past a row.
 *
 * The plugin has three impacts and the lightest of them — LIGHT — is still a
 * tap: iOS plays it from `UIImpactFeedbackGenerator`, which is meant to be
 * audible as an impact, and a bar of buttons that all say that is a bar that
 * rattles. The selection generator is the one the system keeps for a value
 * going by, and it is the quietest thing a phone will do on purpose. A firm
 * pulse — a book coming to rest — keeps the lightest impact, a step above the
 * tick and still well below the medium a game's answer is allowed.
 *
 * Android has no such distinction in the plugin: its selection waveform is a
 * tenth of a second at full amplitude, which reads as a hum rather than as a
 * tick. So the pulse is measured here instead — see SOFT_MS — because a short
 * pulse is the only soft thing the plugin can ask an Android phone for.
 */
async function soft(firm = false): Promise<void> {
  if (!enabled()) return;
  try {
    if (Capacitor.getPlatform() !== "ios") {
      await Haptics.vibrate({ duration: firm ? FIRM_MS : SOFT_MS });
      return;
    }
    if (firm) {
      await Haptics.impact({ style: ImpactStyle.Light });
      return;
    }
    // iOS plays a selection tick from a generator that has been prepared
    // ahead of the tap. One is prepared on the first press and left ready:
    // building one per press would pay for the engine on every button, and the
    // generator prepares itself again after each tick anyway.
    if (!selectionOpen) {
      selectionOpen = true;
      await Haptics.selectionStart();
    }
    await Haptics.selectionChanged();
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

/**
 * One page turning over: the app's softest pulse.
 *
 * A riffle turns a dozen pages in a second, so this is the beat heard most
 * often in the app — anything above the soft pulse would turn a draw into a
 * rattle. It is the same tick as a press on purpose: both are the page moving
 * under the reader, not an answer to anything.
 */
export async function tapPageTurn(): Promise<void> {
  await soft();
}

/**
 * The section mark coming away from the link it was on.
 *
 * One soft tick, the same weight as a press, at the moment the highlight
 * lets go of the words it has been under and starts across the bar. The bar's
 * mark holds its trailing edge for a moment before it snaps across
 * (components/nav-bar.tsx), and that moment is the whole gesture's beat — a
 * finger feels it land even when the eye is on the page that is moving.
 */
export async function tapSectionSnap(): Promise<void> {
  await soft();
}

/**
 * The book coming to rest on the drawn passage.
 *
 * The same soft tick as the turns before it, held a little longer, so the end
 * of the riffle is felt as the settle rather than as another page going by.
 * It is deliberately not a medium any more: a book arriving is navigation, and
 * navigation is not supposed to report like a verdict.
 */
export async function tapBookLanded(): Promise<void> {
  await soft(true);
}

/**
 * A press that lands: every button and link in the app.
 *
 * The softest tick the device has, because a page of controls that each knock
 * is a page that rattles: the answer to a button is acknowledgement, not an
 * event. It is put here rather than in each control so that a button added
 * tomorrow has a feel without being told to (components/press-feedback.tsx
 * keeps the one listener).
 */
export async function tapControl(): Promise<void> {
  await soft();
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
 * The three pulses every scored pattern is written from, and the space each one
 * leaves behind it.
 *
 * `S` is a short: one impact at the lightest weight. `M` is the same kind of
 * tap one step heavier, for the one beat in a tune that lands. `L` is a long: a
 * single continuous buzz. A pattern is written as the run of them it plays —
 * "SSLL" — rather than as a table of absolute times, because a tune laid out as
 * offsets is nearly impossible to check by eye, and the spacing is the same
 * arithmetic every time: a tap clears a hand's reaction, and a long has to
 * finish before the next pulse starts or Android cuts it off part-way.
 */
const SHORT_GAP_MS = 90;
const LONG_MS = 200;
const LONG_GAP_MS = 50;

function beats(score: string): Beat[] {
  let at = 0;
  return [...score].map((step) => {
    if (step === "S" || step === "M") {
      const beat = { at, style: step === "S" ? ImpactStyle.Light : ImpactStyle.Medium };
      at += SHORT_GAP_MS;
      return beat;
    }
    const beat = { at, buzz: LONG_MS };
    at += LONG_MS + LONG_GAP_MS;
    return beat;
  });
}

/**
 * A word found: medium, short, long.
 *
 * The bump is the hand catching the word, the tick is its length going by, and
 * the buzz is the pen following through past the last letter. Ending on the
 * long rather than opening with it is what makes the find sound like a stroke
 * finishing: the heavy beat is the follow-through, not the start. It finishes
 * inside the cross-out's own animation (CROSS_OUT_MS), so a word that ends the
 * board hands over to the card's fanfare only once its own sound is done.
 */
export function tapWordFound(): void {
  pattern(beats("MSL"));
}

/**
 * A line that spelled nothing: short, short, short.
 *
 * Not a scolding — the board drops a wrong line without a mark on it — so it is
 * three light taps and no more: the board says "that was not one" and lets the
 * reader keep looking. Taps rather than hums, so a miss is never mistaken for
 * the long buzz that ends a find.
 */
export function tapLineMissed(): void {
  pattern(beats("SSS"));
}

/**
 * The twelve beats of a win, and the two of a near miss — see the cards below.
 *
 * The win is the app's longest tune: short, short, long, short, long, long,
 * short, long, short, short, long, long. It is deliberately the one pattern
 * long enough to be recognised before it is over.
 */
const GREAT_WORK: Beat[] = beats("SSLSLLSLSSLL");

const NOT_QUITE: Beat[] = [
  { at: 0, style: ImpactStyle.Light },
  { at: 110, style: ImpactStyle.Medium },
];

/**
 * The "Great work" card: the twelve beats of GREAT_WORK.
 *
 * Many beats rather than one because the card is the end of something — a board
 * finished, a word found, a verse named — and a single buzz cannot say that.
 * The two long beats that close it are the reader's own satisfaction, settling.
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
