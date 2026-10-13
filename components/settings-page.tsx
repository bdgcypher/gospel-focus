"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { AppShell } from "./app-shell";
import { BackLink } from "./back-link";
import { Switch } from "./switch";
import { isNative } from "@/lib/external";
import { clearFavorites, useFavorites } from "@/lib/favorites";
import { exportFavoritesFile, importFavoritesText, type ImportReport } from "@/lib/favorites-io";
import {
  FAVORITES_FILE_TYPES,
  pickNativeTextFile,
  shareNativeFile,
  textToBase64,
} from "@/lib/native-files";
import { setPreference, usePreferences } from "@/lib/preferences";

type ThemeChoice = "light" | "dark" | "system";

const THEMES: { id: ThemeChoice; label: string; hint: string }[] = [
  { id: "light", label: "Light", hint: "Paper and ink" },
  { id: "dark", label: "Dark", hint: "For low light" },
  { id: "system", label: "System", hint: "Match the device" },
];

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const prefs = usePreferences();
  const favorites = useFavorites();
  const [report, setReport] = useState<ImportReport | null>(null);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const native = isNative();

  /** What to tell the reader when reading their file went wrong. */
  const reasonOf = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

  const reportFailure = (reason: string) =>
    setReport({ imported: 0, duplicates: 0, skipped: [{ line: 0, reason }] });

  const onExport = async () => {
    const { name, text, mime } = exportFavoritesFile(favorites);
    setStatus(null);

    if (native) {
      // The WebView can't download, so the backup leaves through the share
      // sheet, which is also where "save to Files/Drive" lives.
      const outcome = await shareNativeFile(
        { name, base64: textToBase64(text) },
        { title: "Favorites backup", dialogTitle: "Save favorites backup" }
      );
      setStatus(
        outcome === "done"
          ? "Backup saved or sent."
          : outcome === "cancelled"
            ? null
            : "Couldn't open the share sheet — nothing was exported."
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

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:max-w-5xl sm:px-6 sm:py-10">
        <div className="mt-6 flex items-start justify-between gap-3">
          <div className="min-w-0 max-w-2xl">
            <h2 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">Settings</h2>
            <p className="mt-0.5 text-sm text-muted">How the app looks and moves</p>
          </div>
          <BackLink />
        </div>

        <div className="mt-8 max-w-2xl space-y-8">
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              Appearance
            </h2>
            <div className="rounded-3xl border border-border bg-surface p-5">
              <p className="text-sm font-medium text-foreground">Theme</p>
              <p className="mt-0.5 text-xs text-muted">Choose how Open to Inspiration looks</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {THEMES.map((option) => {
                  const active = current === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTheme(option.id)}
                      aria-pressed={active}
                      className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                        active
                          ? "border-accent/60 bg-accent/15"
                          : "border-border bg-surface-2 hover:border-accent/40"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={active ? "text-accent-strong" : "text-muted"}>
                          {option.id === "light" ? <SunIcon /> : option.id === "dark" ? <MoonIcon /> : <DeviceIcon />}
                        </span>
                        <span className="text-sm font-medium text-foreground">{option.label}</span>
                      </span>
                      <span className="mt-1 block text-xs text-muted">{option.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Motion</h2>
            <div className="flex items-center justify-between gap-4 rounded-3xl border border-border bg-surface p-5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Reduce motion</p>
                <p className="mt-0.5 text-xs text-muted">
                  Skip the page-riffle animation and open the passage straight away
                </p>
              </div>              <Switch
                checked={prefs.reduceMotion}
                onChange={(value) => setPreference("reduceMotion", value)}
                label="Reduce motion"
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Favorites</h2>
            <div className="rounded-3xl border border-border bg-surface p-5">
              <p className="text-sm font-medium text-foreground">Favorites backup</p>
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
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
