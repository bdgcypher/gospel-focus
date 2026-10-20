"use client";

import { useState } from "react";
import { FeaturePage } from "./feature-page";
import { Glyph } from "./glyph";
import { Switch } from "./switch";
import {
  addHeldApp,
  focusStatus,
  lockNow,
  removeHeldApp,
  setFocusUp,
  useFocus,
  type FocusStatus,
} from "@/lib/focus";
import { setGoalMinutes, studyProgress, useStudy } from "@/lib/study";
import { BypassDialog } from "./bypass-dialog";
import { GoalPicker } from "./goal-picker";

/**
 * The Focus page.
 *
 * Two cards, both of them real state: the lock itself — set up or not, holding
 * or standing open by hand while a bypass runs out — and the apps the reader
 * means to hold back.
 * What is not real is the blocking: holding another app back needs Android's
 * usage and accessibility APIs, and that layer does not exist yet, which is what
 * the page's own placeholder block is for. So the page does the honest half
 * properly rather than showing a switch that does nothing: every state here is
 * one the reader sets by hand and can see again on the home screen, and none of
 * it pretends to be enforcement.
 */
export function FocusPage() {
  const focus = useFocus();
  const study = useStudy();
  const progress = studyProgress(study);
  // The day's study is half of where the lock stands: reaching the goal is what
  // opens it, so the status is read with that in hand rather than from the focus
  // state alone (lib/focus.ts).
  const status = focusStatus(focus, { goalMet: progress.done });

  return (
    <FeaturePage featureId="focus-lock">
      {/* One column on a phone, two on a desktop, where the section has the
          width to show the lock and the list it holds side by side.

          The single column is explicit (`grid-cols-1`) rather than left to a
          bare grid: an implicit `auto` track is sized to its content's
          max-content width, so on a phone the cards came out wider than the
          column they sat in and pushed the page sideways. `minmax(0, 1fr)` is
          the track that means "exactly this much room", and it is what
          `grid-cols-2` already means on a desktop.

          The cards keep their own heights rather than being stretched to match:
          they are two different sizes of thing — a state with a switch and a
          day's study in it, and a list the reader adds to — and padding the
          shorter one out to meet the taller would only draw a box of nothing. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
        <FocusCard
          status={status}
          goalMinutes={progress.target}
          minutes={progress.minutes}
          percent={progress.percent}
        />

        <AppsCard apps={focus.apps} />
      </div>
    </FeaturePage>
  );
}

/**
 * The lock itself: one card, its own status as the title, and the day's study
 * inside it once there is a lock to measure against.
 *
 * The state used to be two cards — the switch in one, where today stood and the
 * two buttons in the other — which asked the reader to hold two halves of one
 * decision apart. There is one question here, is the lock on, and there is only
 * one way to answer it, so the page asks it once.
 *
 * Before the lock is set up there is nothing to switch and nothing to count, so
 * the card says that and offers the single thing it can honour: setting it up.
 * One step, deliberately — the app cannot hold another app back until the native
 * layer exists, so the reader's half of the promise today is the lock itself,
 * and walking them through configuring one they cannot yet feel working would be
 * selling something that isn't there.
 *
 * Once it is up, the switch reads the lock rather than a stored flag. On means
 * the apps below are being held, and switching it *on* is never the thing to
 * think twice about: it shuts a bypass that is still open, and with the day's
 * goal already met it is how the reader says they want the apps held anyway —
 * the one answer that outlasts the study that opened the gate (lib/focus.ts).
 * Off is the confessional half — nothing is written until the sheet is
 * confirmed, and what confirming writes is a bypass with a length on it, so the
 * click that means "not now" cannot quietly leave the lock open for good.
 *
 * The third state is the lock standing open on its own: once the goal is met
 * there is nothing left for it to wait on, so the card says so and leaves the
 * switch off rather than pretending the day is still being held.
 *
 * The minutes are shown for the reason they always were: they are what the
 * reader is actually doing, the goal on the home screen is the same number, and
 * they are the counterweight to the switch — the card can offer a way off and,
 * in the same breath, show what the lock is still waiting on.
 */
function FocusCard({
  status,
  goalMinutes,
  minutes,
  percent,
}: {
  status: FocusStatus;
  goalMinutes: number;
  minutes: number;
  percent: number;
}) {
  const [bypassing, setBypassing] = useState(false);
  const setUp = status !== "unset";

  return (
    <div className="rounded-3xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* The card's title is the lock's own state, because that is the one
              thing this card is for. The page above it already says Focus Lock,
              so saying it again here would spend the reader's first glance on
              a noun instead of an answer. */}
          <p className="text-sm font-medium text-foreground">
            {status === "unset" ? "Not set up" : status === "locked" ? "On" : "Off"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {status === "unset"
              ? "Nothing is being held back yet."
              : status === "earned"
                ? "Today's study is done, so the apps are free until tomorrow. Turn it back on to hold them anyway."
                : status === "overridden"
                  ? "Open by hand. It closes again when the time runs out."
                  : "The apps below stay held until the day's study is done."}
          </p>
        </div>

        {/* The one control, and only once there is something to control. Off is
            a question rather than a state change: the sheet asks it and the
            store isn't touched until the answer is yes. */}
        {setUp && (
          <Switch
            checked={status === "locked"}
            onChange={(on) => {
              if (on) {
                // Ends a bypass, and — with the goal already met — records the
                // re-arm for the rest of the day, so the day's study that opened
                // the gate cannot close the reader's own answer on the next
                // render.
                lockNow();
                return;
              }
              setBypassing(true);
            }}
            label="Focus lock"
          />
        )}
      </div>

      {setUp ? (
        <StudyProgress goalMinutes={goalMinutes} minutes={minutes} percent={percent} />
      ) : (
        <button
          type="button"
          onClick={setFocusUp}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-cta px-4 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 sm:w-auto"
        >
          <Glyph name="lock" plain className="h-4 w-4" />
          Set up Focus Lock
        </button>
      )}

      <p className="mt-4 border-t border-border/70 pt-3 text-xs text-muted">
        The lock, the bypass behind it, and the list below are real, and the home screen reads them.
        The blocking itself is not built — that arrives with the native layer described under “Not
        built yet”.
      </p>

      <BypassDialog open={bypassing} onClose={() => setBypassing(false)} />
    </div>
  );
}

/**
 * The day's study, inside the lock's own card.
 *
 * It lives here rather than on a card of its own because it is the lock's
 * reason: the minutes are what the reader is doing about the lock, and the goal
 * is the same number the home screen shows, so the two would only ever describe
 * the same day from two places. With no goal picked yet it offers the picker
 * instead of a bar to fill — a fraction of nothing is not news.
 */
function StudyProgress({
  goalMinutes,
  minutes,
  percent,
}: {
  goalMinutes: number;
  minutes: number;
  percent: number;
}) {
  // The day's goal met is the same green the home screen's hero turns, and the
  // same tokens: the bar here is the lock's half of that one number, so the two
  // places agree about what "done" looks like rather than each choosing a
  // colour. On the paper skin the tokens are the ordinary accent, which is how
  // that skin says anything at all.
  const done = goalMinutes > 0 && minutes >= goalMinutes;

  if (goalMinutes === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-border bg-surface-2/60 p-3">
        <p className="text-xs text-muted">
          No daily study goal yet. Pick one and the minutes count here too.
        </p>
        <div className="mt-2.5">
          <GoalPicker onPick={setGoalMinutes} />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div
        className={`flex flex-wrap items-baseline justify-between gap-x-3 text-xs ${
          done ? "text-goal-muted" : "text-muted"
        }`}
      >
        <span className={`font-semibold tabular-nums ${done ? "text-goal-strong" : "text-foreground"}`}>
          {Math.min(minutes, goalMinutes)} / {goalMinutes} min studied
        </span>
        <span>{done ? "Today's goal met" : "counting while you study"}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Today's study goal"
        aria-valuemin={0}
        aria-valuemax={goalMinutes}
        aria-valuenow={Math.min(minutes, goalMinutes)}
        className={`mt-2 h-2 w-full overflow-hidden rounded-full ${done ? "bg-goal-track" : "bg-surface-2"}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            done ? "bg-goal-bar" : "bg-accent"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The apps the reader means to hold back.
 *
 * Names, typed and kept on the device, because that is what the app can
 * honestly ask for today: it cannot list what is installed without the native
 * layer, and it cannot hold anything yet either. So this is the reader's own
 * note of what the gate is for — the part of the feature that is only ever
 * theirs to decide — and it will be what the native picker starts from.
 */
function AppsCard({ apps }: { apps: string[] }) {
  const [draft, setDraft] = useState("");

  const add = () => {
    if (!draft.trim()) return;
    addHeldApp(draft);
    setDraft("");
  };

  return (
    <div className="rounded-3xl border border-border bg-surface p-5">
      <p className="text-sm font-medium text-foreground">Apps to hold back</p>
      <p className="mt-0.5 text-xs text-muted">
        {apps.length === 0
          ? "Nothing chosen yet. Add the apps that tend to take the time you meant to give."
          : `${apps.length} ${apps.length === 1 ? "app" : "apps"} chosen on this device.`}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Instagram"
          aria-label="App to hold back"
          className="h-11 min-w-0 flex-1 rounded-2xl border border-border bg-surface-2 px-3.5 text-sm text-foreground placeholder:text-muted focus:border-accent/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-border bg-surface-2 px-4 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Glyph name="plus" plain className="h-4 w-4" />
          Add
        </button>
      </form>

      {apps.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {apps.map((app) => (
            <li key={app}>
              <button
                type="button"
                onClick={() => removeHeldApp(app)}
                title={`Remove ${app}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
              >
                {app}
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 border-t border-border/70 pt-3 text-xs text-muted">
        Holding an app back needs Android&apos;s usage and accessibility APIs, so nothing on this list is
        blocked yet. Your list stays on this device.
      </p>
    </div>
  );
}
