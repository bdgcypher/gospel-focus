"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { FeaturePage } from "./feature-page";
import { Glyph } from "./glyph";
import { Switch } from "./switch";
import {
  addHeldApp,
  focusStatus,
  heldAppKey,
  linkHeldApps,
  lockNow,
  removeHeldApp,
  setFocusUp,
  useFocus,
  type FocusStatus,
  type HeldApp,
} from "@/lib/focus";
import { setGoalMinutes, studyProgress, useStudy } from "@/lib/study";
import {
  focusLockSupported,
  listInstalledApps,
  openFocusAccessibilitySettings,
  readFocusAccessibility,
  type FocusAccessibility,
} from "@/lib/native-focus";
import { BypassDialog } from "./bypass-dialog";
import { GoalPicker } from "./goal-picker";

/** Which half of the feature this build has. */
type FocusPlatform = "android" | "web" | "unknown";

/** Nothing to watch: the platform cannot change while the page is open. */
const subscribePlatform = () => () => {};

/**
 * Which half of the feature this build has — "unknown" until the page is on the
 * device and can say.
 *
 * The server renders this app as the web build, so asking Capacitor during
 * hydration would disagree with the HTML on every Android launch (the typed list
 * against the picker, the web note against the permission row). `useSyncExternalStore`
 * uses the server snapshot for the hydrating render and the real one immediately
 * after, which keeps the first frame identical to the HTML and then swaps the
 * right half in — and "unknown" is what every caller reads as "show only what is
 * true either way" in the frame between.
 */
function useFocusPlatform(): FocusPlatform {
  return useSyncExternalStore(
    subscribePlatform,
    () => (focusLockSupported() ? "android" : "web"),
    () => "unknown"
  );
}

/**
 * The Focus page.
 *
 * Two cards, both of them real state: the lock itself — set up or not, holding
 * or standing open by hand while a bypass runs out, with Android's permission and
 * what it enables — and the apps the reader means to hold back.
 *
 * The blocking is now real too: on Android, an accessibility service draws a lock
 * screen over the chosen apps until the day's study is done
 * (android/app/.../FocusAccessibilityService.java), and the page is where the
 * permission is asked for and the list is chosen. Nothing here asserts that the
 * gate is working, though — the permission row reads the device, so a reader who
 * has not turned access on is told nothing is being blocked rather than being
 * left to believe a switch.
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
 * One step, deliberately — the app picker and the permission row arrive with the
 * lock, and asking for either before there is a lock to arm would be setting up
 * something the reader has not chosen yet.
 *
 * Once it is up, the switch reads the lock rather than a stored flag. On means
 * the chosen apps are being held, and switching it *on* is never the thing to
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
  const platform = useFocusPlatform();

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
                  : goalMinutes === 0
                    ? "Pick a daily goal below. The lock opens when that day's study is done, so nothing is held until there is one."
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
        <>
          <StudyProgress goalMinutes={goalMinutes} minutes={minutes} percent={percent} />
          <AccessibilityRow goalSet={goalMinutes > 0} />
        </>
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
        {platform === "android"
          ? "The lock, the app list, and the lock screen are real. Apps are held only while Android's accessibility access is on and the lock is armed."
          : platform === "web"
            ? "The lock, the bypass, and the app list are real, and the home screen reads them. Holding other apps back needs the Android app."
            : "The lock, the bypass, and the app list are real, and the home screen reads them."}
      </p>

      <BypassDialog open={bypassing} onClose={() => setBypassing(false)} />
    </div>
  );
}

/**
 * Whether Android will let the gate draw at all, said plainly.
 *
 * The switch and the app list can both look ready while the permission that makes
 * either mean anything is off, so this reads the device rather than the stored
 * state: `enabled` is the system's answer, not the app's. It is re-read when the
 * reader comes back from Android's settings — the only way to know they changed
 * anything — and the row stays quiet until the first answer arrives rather than
 * announcing "off" for a frame.
 *
 * On the web it is a sentence rather than a control: there is no permission to
 * grant and no other app to see, and offering a button that could not change
 * anything would be the placeholder this app does not keep.
 */
function AccessibilityRow({ goalSet }: { goalSet: boolean }) {
  const platform = useFocusPlatform();
  const [access, setAccess] = useState<FocusAccessibility | null>(null);

  useEffect(() => {
    if (platform !== "android") return;
    let live = true;

    const read = () => {
      void readFocusAccessibility().then((next) => {
        if (live) setAccess(next);
      });
    };

    read();
    const onVisible = () => {
      if (!document.hidden) read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [platform]);

  if (platform === "unknown") return null;

  if (platform === "web") {
    return (
      <p className="mt-4 rounded-2xl border border-border bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">
        Blocking other apps is the Android app&apos;s half. On the web the lock keeps its state and
        the home screen reads it, but nothing is held.
      </p>
    );
  }

  if (!access) return null;

  return (
    <div
      className={`mt-4 rounded-2xl border p-3 ${
        access.enabled ? "border-border bg-surface-2/60" : "border-accent/40 bg-accent/5"
      }`}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Glyph
          name={access.enabled ? "check" : "lock"}
          plain
          className="h-3.5 w-3.5 text-accent-strong"
        />
        {access.enabled ? "Accessibility access is on" : "Accessibility access is off"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {access.enabled
          ? goalSet
            ? "The apps you choose below are held while the lock is on."
            : "Access is ready, but nothing is held until you pick a daily goal."
          : "Nothing is being blocked. Android needs access so Focus Lock can see which app opened and draw its lock screen over one on your list. Gospel Focus does not read your screen."}
      </p>
      {!access.enabled && (
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Installed from a file, Android may grey the service out until you allow restricted
          settings for Gospel Focus in App info.
        </p>
      )}
      <button
        type="button"
        onClick={() => void openFocusAccessibilitySettings()}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
      >
        {access.enabled ? "Manage access" : "Turn on access"}
      </button>
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
 * On Android the list is the device's own: the picker is built from every app with
 * a launcher icon, so a choice is a package the accessibility service can match
 * rather than a name typed into a box. That is the difference between a list that
 * describes the lock and a list that is the lock.
 *
 * A name typed by hand is still accepted where there is no app list to pick from —
 * the web build, and an Android device whose list could not be read. It is kept as
 * the reader's own note, with no package, and the footnote says so: nothing about
 * a typed name can be blocked.
 *
 * The other half of the Android story is that the reader's list may have been
 * written before the picker existed, so it is matched to installed apps by label
 * once the list arrives (`linkHeldApps`) — their earlier choice starts working
 * instead of having to be made twice.
 */
function AppsCard({ apps }: { apps: HeldApp[] }) {
  const platform = useFocusPlatform();
  const android = platform === "android";
  const [draft, setDraft] = useState("");
  const [installed, setInstalled] = useState<HeldApp[] | null>(null);
  const [listingFailed, setListingFailed] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!android) return;
    let live = true;

    void listInstalledApps().then((list) => {
      if (!live) return;
      // An empty list from a working plugin means a device with no launcher apps,
      // which is not a thing; treat it as the read having failed, and say so
      // rather than showing a picker with nothing in it.
      if (list.length === 0) {
        setListingFailed(true);
        return;
      }
      setInstalled(list);
      linkHeldApps(list);
    });

    return () => {
      live = false;
    };
  }, [android]);

  const held = useMemo(
    () => new Set(apps.filter((app) => app.package).map((app) => app.package)),
    [apps]
  );

  // Every launcher app would be a long scroll and a lot of buttons; the search is
  // the way through it, and the first sixty covers the whole of most phones'
  // home screens. Typing narrows before the cut, so a match is never hidden by it.
  const visible = useMemo(() => {
    if (!installed) return [];
    const needle = query.trim().toLowerCase();
    const list = needle
      ? installed.filter(
          (app) =>
            app.label.toLowerCase().includes(needle) || app.package.toLowerCase().includes(needle)
        )
      : installed;
    return list.slice(0, 60);
  }, [installed, query]);

  const typed = platform === "web" || listingFailed;

  const add = () => {
    if (!draft.trim()) return;
    addHeldApp({ package: "", label: draft });
    setDraft("");
  };

  return (
    <div className="rounded-3xl border border-border bg-surface p-5">
      <p className="text-sm font-medium text-foreground">Apps to hold back</p>
      <p className="mt-0.5 text-xs text-muted">
        {apps.length === 0
          ? android
            ? "Nothing chosen yet. Pick the apps that tend to take the time you meant to give."
            : "Nothing chosen yet. Add the apps that tend to take the time you meant to give."
          : `${apps.length} ${apps.length === 1 ? "app" : "apps"} chosen on this device.`}
      </p>

      {apps.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {apps.map((app) => (
            <li key={heldAppKey(app)}>
              <button
                type="button"
                onClick={() => removeHeldApp(heldAppKey(app))}
                title={
                  app.package ? `Remove ${app.label}` : `${app.label} — not matched to an installed app`
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
              >
                {app.label}
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

      {android && !listingFailed && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the apps on this device"
            aria-label="Search apps"
            className="mt-4 h-11 w-full rounded-2xl border border-border bg-surface-2 px-3.5 text-sm text-foreground placeholder:text-muted focus:border-accent/60 focus:outline-none"
          />

          {!installed ? (
            <p className="mt-3 text-xs text-muted">Reading the apps on this device…</p>
          ) : visible.length === 0 ? (
            <p className="mt-3 text-xs text-muted">No app on this device matches that.</p>
          ) : (
            <ul className="mt-3 max-h-72 overflow-y-auto rounded-2xl border border-border">
              {visible.map((app) => {
                const on = held.has(app.package);
                return (
                  <li key={app.package}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => (on ? removeHeldApp(heldAppKey(app)) : addHeldApp(app))}
                      className={`flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-2 ${
                        on ? "bg-accent/5" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {app.label}
                        </span>
                        <span className="block truncate text-[11px] text-muted">{app.package}</span>
                      </span>
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                          on
                            ? "border-accent bg-accent text-accent-contrast"
                            : "border-border text-transparent"
                        }`}
                      >
                        <Glyph name="check" plain className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* The list is cut at sixty rows so a phone with a few hundred apps
              does not render all of them; the search is the way through, and this
              says the cut exists rather than letting an app look missing. */}
          {installed && !query.trim() && installed.length > visible.length && (
            <p className="mt-2 text-[11px] text-muted">
              Showing the first {visible.length} — search to find the rest.
            </p>
          )}
        </>
      )}

      {/* The typed fallback, for the builds that have no app list to offer. */}
      {typed && (
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
      )}

      <p className="mt-4 border-t border-border/70 pt-3 text-xs text-muted">
        {android && !listingFailed
          ? "Holding an app back uses Android's accessibility service: it sees which app comes to the front and draws the lock screen over the ones on this list. It does not read your screen. The list stays on this device."
          : platform === "web"
            ? "These names stay on this device as a note. Holding an app back needs the Android app's own app list, so a name typed here cannot block anything."
            : "The list stays on this device."}
      </p>
    </div>
  );
}
