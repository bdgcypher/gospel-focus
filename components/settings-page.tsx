"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { AppShell } from "./app-shell";
import { BackLink } from "./back-link";
import { Glyph } from "./glyph";
import { GoalPicker } from "./goal-picker";
import { Switch } from "./switch";
import { isNative } from "@/lib/external";
import { featureById } from "@/lib/features";
import {
  focusLockSupported,
  openFocusAccessibilitySettings,
  readFocusAccessibility,
  type FocusAccessibility,
} from "@/lib/native-focus";
import { loadManifest } from "@/lib/picker";
import {
  cancelDailyReminders,
  reminderPermission,
  remindersSupported,
  requestReminderPermission,
  syncDailyReminders,
  type ReminderPermission,
} from "@/lib/reminders";
import { setGoalMinutes, studyProgress, useStudy } from "@/lib/study";
import { clearFavorites, useFavorites } from "@/lib/favorites";
import { exportFavoritesFile, importFavoritesText, type ImportReport } from "@/lib/favorites-io";
import {
  FAVORITES_FILE_TYPES,
  downloadNativeFile,
  pickNativeTextFile,
  shareNativeFile,
  textToBase64,
} from "@/lib/native-files";
import { setPreference, usePreferences, type StyleChoice } from "@/lib/preferences";

type ThemeChoice = "light" | "dark" | "system";

/** A time of day as the reader would say it, e.g. 7, 0 -> "7:00 AM". */
function formatTime(hour: number, minute: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  return `${shown}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** The value a `<input type="time">` wants, e.g. 7:05 -> "07:05". */
function timeValue(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

/** The emoji face of each theme, worn while the playful style is on. */
const THEME_EMOJI: Record<ThemeChoice, string> = {
  light: "☀️",
  dark: "🌙",
  system: "💻",
};

/**
 * The other axis: how the app is drawn, whatever the light is doing.
 *
 * Two choices rather than four theme names, because they really are two things
 * — a reader who likes the emoji might still want the dark page at night, and
 * one who wants the paper look shouldn't lose it by switching to dark.
 */
const STYLES: { id: StyleChoice; label: string }[] = [
  { id: "focused", label: "Focused" },
  { id: "playful", label: "Playful" },
];

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const prefs = usePreferences();
  const favorites = useFavorites();
  const [report, setReport] = useState<ImportReport | null>(null);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [reminderStatus, setReminderStatus] = useState<string | null>(null);
  const [reminderBusy, setReminderBusy] = useState(false);
  /** Where the OS permission stands, so a revoked one can be pointed out. */
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  /** Whether the accessibility service is on, for the Gospel Library's card. */
  const [access, setAccess] = useState<FocusAccessibility | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const native = isNative();
  const study = useStudy();
  const progress = studyProgress(study);
  /** The widget's catalog entry, so this row and its page can't disagree. */
  const widget = featureById("widget");

  // Whether the reminder is actually allowed is the system's answer, not the
  // stored preference — it can be revoked from outside the app at any time.
  useEffect(() => {
    let live = true;
    void reminderPermission().then((state) => {
      if (live) setPermission(state);
    });
    return () => {
      live = false;
    };
  }, [prefs.dailyReminder]);

  // The Gospel Library's minutes are counted by the accessibility service, so
  // whether that grant is on is the system's answer rather than a stored fact —
  // and it is re-read on coming back from Android's settings, which is the only
  // way to know the reader changed it. Nothing is asked for here: the row is a
  // report and a door, and the permission itself is granted in Android's own
  // screen (see `turnOnGospelLibrarySync`).
  useEffect(() => {
    if (!focusLockSupported()) return;
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
  }, []);

  /** What to tell the reader when reading their file went wrong. */
  const reasonOf = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

  const reportFailure = (reason: string) =>
    setReport({ imported: 0, duplicates: 0, skipped: [{ line: 0, reason }] });

  /**
   * Turn the daily reminder on or off.
   *
   * The permission is asked for here, in response to the tap, rather than on
   * launch: a system prompt that arrives unexplained on first open is the
   * quickest way to a permanent "don't allow".
   */
  const onToggleReminder = async (value: boolean) => {
    setReminderBusy(true);
    setReminderStatus(null);
    try {
      if (!value) {
        setPreference("dailyReminder", false);
        await cancelDailyReminders();
        setPermission(await reminderPermission());
        return;
      }

      if (!remindersSupported()) {
        setReminderStatus("Reminders only work in the installed app, not in the browser.");
        return;
      }

      const granted = await requestReminderPermission();
      setPermission(granted);
      if (granted !== "granted") {
        setReminderStatus(
          granted === "denied"
            ? "Notifications are blocked for Gospel Focus. Allow them in your device settings, then try again."
            : "Notifications weren't allowed, so the reminder is still off."
        );
        return;
      }

      setPreference("dailyReminder", true);
      const manifest = await loadManifest();
      const result = await syncDailyReminders({
        manifest,
        filters: prefs.filters,
        hour: prefs.reminderHour,
        minute: prefs.reminderMinute,
      });
      setReminderStatus(
        result
          ? `Set — a verse arrives each day at ${formatTime(prefs.reminderHour, prefs.reminderMinute)}, for the next ${result.scheduled} days.`
          : "Set. The reminder will be scheduled the next time the app opens."
      );
    } catch (error) {
      setReminderStatus(reasonOf(error, "the reminder couldn't be scheduled"));
    } finally {
      setReminderBusy(false);
    }
  };

  /**
   * Move the reminder to another time.
   *
   * Nothing is scheduled here: the app's reminder sync watches these
   * preferences from every screen and reschedules the window a moment later, so
   * a reader who steps through a few times only causes one round of scheduling.
   * The note under the card says where it now stands.
   *
   * The value arrives as "HH:MM" — from the system picker on a phone, from the
   * field's own segments on a desktop — and is only stored once it is a whole
   * time, so the empty value a picker reports mid-edit leaves the reminder
   * where it was.
   */
  const onPickTime = (value: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value);
    if (!match) return;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return;
    setPreference("reminderHour", hour);
    setPreference("reminderMinute", minute);
    setReminderStatus(
      prefs.dailyReminder ? `Set — a verse arrives each day at ${formatTime(hour, minute)}.` : null
    );
  };

  /** The reminder is on, but the system says notifications aren't allowed. */
  const reminderBlocked =
    prefs.dailyReminder && permission !== null && permission !== "granted" && permission !== "unsupported";

  const onExport = async () => {
    const { name, text, mime } = exportFavoritesFile(favorites);
    setStatus(null);

    if (native) {
      const file = { name, mime, base64: textToBase64(text) };
      try {
        // The WebView can't download, so the platform saves the file into
        // Downloads itself — no chooser, which is what a backup wants.
        const saved = await downloadNativeFile(file);
        setStatus(`Saved to ${saved.location}/${saved.name}.`);
        return;
      } catch {
        // Refused storage permission on an older Android, or no Downloads
        // folder to write to. The share sheet is the only other way off the
        // device, so fall back to it instead of failing flat.
      }
      const outcome = await shareNativeFile(file, {
        title: "Favorites backup",
        dialogTitle: "Save favorites backup",
      });
      setStatus(
        outcome === "done"
          ? "Saved or sent through the share sheet."
          : outcome === "cancelled"
            ? null
            : "Couldn't save the backup file — nothing was exported."
      );
      return;
    }

    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setStatus("Saved the backup file.");
  };

  /** Open whichever picker this platform has; both hand back the file's text. */
  const onImport = async () => {
    if (!native) {
      fileRef.current?.click();
      return;
    }

    setImporting(true);
    setStatus(null);
    try {
      const picked = await pickNativeTextFile(FAVORITES_FILE_TYPES);
      // Nothing is cleared up front: backing out of the picker leaves the
      // previous result on screen instead of blanking it.
      if (picked) setReport(await importFavoritesText(picked.text));
    } catch (error) {
      reportFailure(reasonOf(error, "the file couldn't be read"));
    } finally {
      setImporting(false);
    }
  };

  const onImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clear it straight away so the same file can be imported again later.
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    setReport(null);
    setStatus(null);
    try {
      setReport(await importFavoritesText(await file.text()));
    } catch (error) {
      reportFailure(reasonOf(error, "the file couldn't be read"));
    } finally {
      setImporting(false);
    }
  };
  // Theme is only known on the client; render the choice once we have it.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const current = mounted ? (theme as ThemeChoice | undefined) : undefined;
  /** The app's own half, where a permission can actually be granted. */
  const android = mounted && focusLockSupported();
  // While the playful style is on, the theme choices wear the skin's own emoji
  // face — a row of stroke drawings in an app made of emoji would look like the
  // odd ones out.
  const playful = prefs.style === "playful";
  // Whether the reminder can work here is only known on the client. Until
  // then this says what the prerendered page said (a browser), so hydration
  // has nothing to disagree with — the app shell is the same page in both
  // cases, only the sentence differs.
  const reminderUsable = mounted && remindersSupported();

  /**
   * Land on the Gospel Library's card when a link names it.
   *
   * The hub's goal line links here by fragment, and the card is Android-only —
   * not in the prerendered page, and gone until the client knows the platform —
   * so the browser cannot find the target on its own. This scrolls once the card
   * is there, the same arrangement the favorites page uses for links that land on
   * a note.
   */
  useEffect(() => {
    if (!android) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [android]);

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:max-w-5xl sm:px-6 sm:py-10">
        {/* The page's padding is the whole of the gap under the app bar. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 max-w-2xl">
            <h2 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">Settings</h2>
          </div>
          <BackLink />
        </div>

        {/* Full column width, like the rest of the app's cards: the sections
            used to stop at max-w-2xl and left the right of the page empty. */}
        <div className="mt-8 space-y-8">
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              Appearance
            </h2>
            <div className="rounded-3xl border border-border bg-surface p-5">
              {/* Theme and style are two independent choices, so the card
                  says so: the light of the page, then the way it is drawn. */}
              <p id="theme-heading" className="text-sm font-medium text-foreground">
                Theme
              </p>
              <div
                role="radiogroup"
                aria-labelledby="theme-heading"
                className="mt-4 grid gap-2 sm:grid-cols-3"
              >
                {THEMES.map((option) => (
                  <RadioCard
                    key={option.id}
                    name="theme"
                    value={option.id}
                    checked={current === option.id}
                    onChange={() => setTheme(option.id)}
                    label={option.label}
                    icon={
                      playful ? (
                        <span className="text-base leading-none" aria-hidden="true">
                          {THEME_EMOJI[option.id]}
                        </span>
                      ) : option.id === "light" ? (
                        <SunIcon />
                      ) : option.id === "dark" ? (
                        <MoonIcon />
                      ) : (
                        <DeviceIcon />
                      )
                    }
                  />
                ))}
              </div>

              <div className="mt-5 border-t border-border/70 pt-4">
                <p id="style-heading" className="text-sm font-medium text-foreground">
                  Style
                </p>
                <div
                  role="radiogroup"
                  aria-labelledby="style-heading"
                  className="mt-4 grid gap-2 sm:grid-cols-2"
                >
                  {STYLES.map((option) => (
                    <RadioCard
                      key={option.id}
                      name="style"
                      value={option.id}
                      checked={prefs.style === option.id}
                      onChange={() => setPreference("style", option.id)}
                      label={option.label}
                      icon={
                        option.id === "playful" ? (
                          <span className="text-base leading-none" aria-hidden="true">
                            🌈
                          </span>
                        ) : (
                          <span className="font-serif text-sm font-semibold" aria-hidden="true">
                            Aa
                          </span>
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Motion</h2>
            <div className="flex items-center justify-between gap-4 rounded-3xl border border-border bg-surface p-5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Reduce motion</p>
              </div>
              <Switch
                checked={prefs.reduceMotion}
                onChange={(value) => setPreference("reduceMotion", value)}
                label="Reduce motion"
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Daily</h2>
            <div className="space-y-3">
              {/* The goal's one home. The stats page links straight to this
                  card (its Edit button, carrying a pencil), which is why the id
                  and the scroll margin are here rather than on the section: the
                  sticky app bar would otherwise cover the heading it landed on. */}
              <div id="study-goal" className="scroll-mt-24 rounded-3xl border border-border bg-surface p-5">
                <p className="text-sm font-medium text-foreground">Daily study goal</p>

                <div className="mt-3">
                  <GoalPicker
                    onPick={setGoalMinutes}
                    current={progress.target || undefined}
                    allowCustom
                  />
                </div>
              </div>

              {/* The Gospel Library's own setting, here rather than on /focus
                  because it is about where study is counted, not about blocking:
                  it works with Focus Lock switched off. Android only, since the
                  count comes from the accessibility service — the same grant
                  Focus Lock asks for — and nowhere else can see another app. The
                  id is the hub's link target, so the card says where to go and
                  this is where the reader lands. */}
              {android && (
                <div
                  id="gospel-library-sync"
                  className="scroll-mt-24 rounded-3xl border border-border bg-surface p-5"
                >
                  <p className="text-sm font-medium text-foreground">Gospel Library Sync</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {access === null
                      ? "Reading in the Gospel Library app can count towards your daily study goal."
                      : access.enabled
                        ? "On — reading in the Gospel Library app counts towards your daily study goal."
                        : "Off — reading in the Gospel Library app is not counted towards your goal yet."}
                  </p>

                  {/* The same row /focus shows for the same grant: the two are
                      one permission, so they are read and worded the same way
                      rather than each explaining it in its own words. */}
                  {access && (
                    <div
                      className={`mt-3 rounded-2xl border p-3 ${
                        access.enabled ? "border-border bg-surface-2/60" : "border-accent/40 bg-accent/5"
                      }`}
                    >
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Glyph
                          name={access.enabled ? "check" : "lock"}
                          plain
                          className="h-3.5 w-3.5 text-accent-strong"
                        />
                        {access.enabled
                          ? "Accessibility access enabled"
                          : "Accessibility access is off"}
                      </p>
                      {!access.enabled && (
                        <p className="mt-1 text-xs leading-relaxed text-muted">
                          Nothing is being counted. Android needs access so Gospel Focus can tell
                          which app is open. Gospel Focus does not read your screen.
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
                  )}
                </div>
              )}

              {/* Offered on a phone and in the installed app, not on a desktop
                  page: a reminder is something a phone delivers, and a browser
                  at that width cannot deliver one at all. In the app the row
                  stays at every width — a tablet can take notifications — so
                  it is the browser that is hidden rather than the wide screen
                  itself. `reminderUsable` rather than the platform check
                  because it is false until the client has mounted, which is
                  also what the prerendered page says: the first client render
                  agrees with it, and the app's own shell then reveals the row
                  instead of React leaving a mismatched class in place. */}
              <div
                className={`${reminderUsable ? "" : "sm:hidden"} rounded-3xl border border-border bg-surface p-5`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Daily study reminder</p>
                    <p className="mt-0.5 text-xs text-muted">Get notified when it is time to study.</p>
                  </div>
                  <Switch
                    checked={prefs.dailyReminder}
                    onChange={(value) => void onToggleReminder(value)}
                    label="Daily study reminder"
                    disabled={!reminderUsable || reminderBusy}
                  />
                </div>

                {/* The time the reminder lands at. A real time field rather
                    than the row of hours this used to be: on a phone it opens
                    the system's own picker (the wheel on iOS, the clock dialog
                    on Android), and on a desktop its segments can simply be
                    typed into. It is here whether the reminder is on or off, so
                    the time can be chosen first — and a change while it is on
                    is rescheduled by the app's own sync
                    (components/reminder-sync.tsx), which watches it. A browser
                    can't deliver the reminder at all, so there the control is
                    shown but shut — and only on a phone-sized page, since the
                    card is hidden where a reminder would never be used. */}
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
                  <label htmlFor="reminder-time" className="text-sm font-medium text-foreground">
                    Reminder time
                  </label>
                  <input
                    id="reminder-time"
                    type="time"
                    step={60}
                    value={timeValue(prefs.reminderHour, prefs.reminderMinute)}
                    onChange={(event) => onPickTime(event.target.value)}
                    disabled={!reminderUsable || reminderBusy}
                    className="rounded-full border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/60 focus:border-accent/60 focus:outline-none disabled:cursor-default disabled:opacity-45 disabled:hover:border-border"
                  />
                </div>

                {reminderBlocked && (
                  <p className="mt-3 rounded-2xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent-strong">
                    Notifications are switched off for Gospel Focus in your device settings, so no reminder
                    can arrive. Turn them back on there and it will resume.
                  </p>
                )}
                {reminderStatus && <p className="mt-3 text-xs text-muted">{reminderStatus}</p>}
              </div>

              {/* The widget's own row, where a reader goes looking for it. It
                  has no card on the hub — it isn't a first move, it is set up
                  on the device — so the menu and this row are how it is found.
                  The copy is the catalog's, so this, the menu and the page
                  can't describe it three ways. */}
              {/* Hidden on desktop for the same reason as the reminder: a
                  home-screen widget is a thing you put on a phone. */}
              <div
                className={`${reminderUsable ? "" : "sm:hidden"} rounded-3xl border border-border bg-surface p-5`}
              >
                <p className="text-sm font-medium text-foreground">Home-Screen Widgets</p>
                <p className="mt-0.5 text-xs text-muted">
                  {widget?.blurb ?? "Verse of the day, streak, and a one-tap draw"} — not built yet.
                </p>
                <Link
                  href="/widgets"
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
                >
                  See the plan
                  <Glyph name="arrow" className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Storage</h2>
            <div className="rounded-3xl border border-border bg-surface p-5">
              <p className="text-sm font-medium text-foreground">Favorites</p>
              <p className="mt-0.5 text-xs text-muted">
                {favorites.length === 0
                  ? "Nothing saved yet."
                  : `${favorites.length} ${favorites.length === 1 ? "passage" : "passages"} saved on this device.`}
              </p>

              <div className="mt-4 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => void onExport()}
                  disabled={favorites.length === 0}
                  className="inline-flex items-center gap-2 rounded-full bg-cta px-4 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <DownloadIcon />
                  Export to file
                </button>
                <button
                  type="button"
                  onClick={() => void onImport()}
                  disabled={importing}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UploadIcon />
                  {importing ? "Reading…" : "Import from file"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearFavorites();
                    setReport(null);
                    setStatus(null);
                  }}
                  disabled={favorites.length === 0}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <TrashIcon />
                  Clear favorites
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  onChange={(event) => void onImportFile(event)}
                  className="hidden"
                  aria-label="Favorites file to import"
                />
              </div>

              {status && <p className="mt-3 text-xs text-muted">{status}</p>}
              {report && <ImportSummary report={report} />}
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}

/**
 * One row of a radio group, drawn as a flat card rather than a raised button.
 *
 * The theme and style choices are settings, not actions: a radio says so and a
 * filled block does not. The row wears the radio itself on the right — a ring
 * that fills with the accent when chosen — and the whole label is the target, so
 * a reader can pick anywhere on the row. The face stays flat (no raised edge or
 * gradient) for the same reason: these are facts to choose between, not buttons
 * to press, and the playful skin's depth should belong to the controls that
 * really are controls. The row is the name alone: what each choice looks like
 * is what the choice does, so a line about it would be read once and skipped
 * after that.
 *
 * The input is visually hidden rather than replaced: it keeps the native radio
 * group's arrow-key navigation and its place in the tab order, and the label
 * around it gives it its name. `peer-*` carries the chosen state to the row's
 * parts, `has-*` carries keyboard focus.
 */
function RadioCard({
  name,
  value,
  checked,
  onChange,
  icon,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <label className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-surface-2 px-4 py-3 transition-colors hover:border-accent/50 has-[:checked]:border-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span className="mt-0.5 shrink-0 text-muted peer-checked:text-accent-strong">{icon}</span>
      <span className="min-w-0 flex-1 peer-checked:text-accent-strong">
        <span className="block text-sm font-medium">{label}</span>
      </span>
      <span
        aria-hidden="true"
        className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-muted/60 peer-checked:border-accent"
      >
        <span className="h-2 w-2 rounded-full bg-accent opacity-0 group-has-[:checked]:opacity-100" />
      </span>
    </label>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function DeviceIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

/** What an import did: how many landed, how many were already there, what was unusable. */
function ImportSummary({ report }: { report: ImportReport }) {
  const skipped = report.skipped.length;

  return (
    <div className="mt-4 rounded-2xl border border-border bg-surface-2/60 p-4">
      <p className="text-xs font-medium text-foreground">
        Imported {report.imported}
        {report.duplicates > 0 && ` · ${report.duplicates} already saved`}
        {skipped > 0 && ` · ${skipped} row${skipped === 1 ? "" : "s"} skipped`}
      </p>
      {skipped > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {report.skipped.slice(0, 5).map((entry, index) => (
            <li key={`${entry.line}-${index}`}>
              {entry.line > 0 ? `Line ${entry.line}: ` : ""}
              {entry.reason}
            </li>
          ))}
          {skipped > 5 && <li>…and {skipped - 5} more</li>}
        </ul>
      )}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11m0 0-4-4m4 4 4-4" />
      <path d="M5 18.5h14" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V8m0 0L8 12m4-4 4 4" />
      <path d="M5 5.5h14" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m1.5 0-.6 12.1A1.5 1.5 0 0 1 14.4 20.5H9.6a1.5 1.5 0 0 1-1.5-1.4L7.5 7" />
    </svg>
  );
}
