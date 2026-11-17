"use client";

import { useRef, useState } from "react";
import { useAnnotations } from "@/lib/annotations";
import {
  ANNOTATIONS_FILE_TYPES,
  exportAnnotationsFile,
  importAnnotationsText,
  type AnnotationImportReport,
} from "@/lib/annotations-io";
import { isNative, openExternal } from "@/lib/external";
import {
  downloadNativeFile,
  pickNativeTextFile,
  shareNativeFile,
  textToBase64,
} from "@/lib/native-files";

/**
 * Marks and notes, and the way they travel to and from Gospel Library.
 *
 * The panel is a file's two doors. There is no live sync to build: the Church's
 * notes sit behind an account and an API that only its own apps are registered
 * for, and a third-party app that asked for the password would be collecting
 * credentials it has no business holding. So the notes travel as the files the
 * Church exports — downloaded there, imported here — and the same files go back
 * the other way. The format is Gospel Library's own (see lib/annotations-io.ts),
 * so a mark lands on the words it was drawn over rather than on the verse as a
 * whole.
 *
 * The download and picker paths are the app's existing native ones: a Capacitor
 * WebView cannot download a file or hand back a `content://` URI to a file
 * input, so on device the platform writes the file and reads the pick, and in a
 * browser the ordinary blob download and file input do the same job.
 */

/** Where the Church keeps the notes a reader can download. */
const NOTES_URL = "https://www.churchofjesuschrist.org/notes";

export function MarksPanel() {
  const marks = useAnnotations();
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [report, setReport] = useState<AnnotationImportReport | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const native = isNative();

  const exportNow = async () => {
    setBusy("export");
    setStatus(null);
    try {
      const { name, text, mime, count } = await exportAnnotationsFile(marks);
      if (native) {
        const file = { name, mime, base64: textToBase64(text) };
        try {
          const saved = await downloadNativeFile(file);
          setStatus(`Saved ${count} ${count === 1 ? "mark" : "marks"} to ${saved.location}/${saved.name}.`);
          return;
        } catch {
          // No Downloads folder to write to — the share sheet is the other way
          // off the device.
        }
        const outcome = await shareNativeFile(file, {
          title: "Gospel Library annotations",
          dialogTitle: "Save annotations",
        });
        setStatus(
          outcome === "done"
            ? `${count} ${count === 1 ? "mark" : "marks"} saved or sent.`
            : outcome === "cancelled"
              ? null
              : "Couldn't save the file — nothing was exported."
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
      setStatus(`Saved ${count} ${count === 1 ? "mark" : "marks"} as ${name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The file couldn't be written.");
    } finally {
      setBusy(null);
    }
  };

  const importNow = async () => {
    if (!native) {
      picker.current?.click();
      return;
    }

    setBusy("import");
    setStatus(null);
    try {
      const picked = await pickNativeTextFile(ANNOTATIONS_FILE_TYPES, 8 * 1024 * 1024);
      if (picked) setReport(await importAnnotationsText(picked.text));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The file couldn't be read.");
    } finally {
      setBusy(null);
    }
  };

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared at once so the same file can be imported again later.
    event.target.value = "";
    if (!file) return;

    setBusy("import");
    setStatus(null);
    setReport(null);
    try {
      setReport(await importAnnotationsText(await file.text()));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The file couldn't be read.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-3xl border border-border bg-surface p-5">
      <p className="text-sm font-medium text-foreground">Notes &amp; Annotations</p>
      <p className="mt-0.5 text-xs text-muted">
        {marks.length === 0
          ? "Nothing marked yet. Highlight or underline any words in the reader."
          : `${marks.length} on this device`}
      </p>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => void exportNow()}
          disabled={marks.length === 0 || busy !== null}
          className="inline-flex items-center gap-2 rounded-full bg-cta px-4 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowDownIcon />
          {busy === "export" ? "Writing…" : "Export to file"}
        </button>
        <button
          type="button"
          onClick={() => void importNow()}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowUpIcon />
          {busy === "import" ? "Reading…" : "Import from file"}
        </button>
        <input
          ref={picker}
          type="file"
          accept=".json,.csv,application/json,text/csv,text/plain"
          onChange={(event) => void importFile(event)}
          className="hidden"
          aria-label="Gospel Library annotations file to import"
        />
      </div>

      {status && <p className="mt-3 text-xs text-muted">{status}</p>}
      {report && <ImportSummary report={report} />}

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs text-muted">
          Notes and annotations from Gospel Library can be downloaded from an account on the church&apos;s website
          and imported here.
        </p>
        <button
          type="button"
          onClick={() => void openExternal(NOTES_URL)}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
        >
          Download Church Account Notes
        </button>
      </div>
    </div>
  );
}

function ImportSummary({ report }: { report: AnnotationImportReport }) {
  const skipped = report.skipped.length;
  // A download of a whole account repeats the same reason hundreds of times —
  // one for every talk from a conference this build doesn't hold. Counting the
  // reasons keeps the report readable without hiding any of them.
  const reasons = [...
    report.skipped.reduce((counts, entry) => {
      counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  ];

  return (
    <div className="mt-3 rounded-2xl border border-border bg-surface-2 px-3.5 py-3 text-xs text-foreground">
      <p className="font-medium">
        Imported {report.imported}
        {report.updated > 0 && ` · ${report.updated} updated`}
        {skipped > 0 && ` · ${skipped} skipped`}
      </p>
      <ul className="mt-1.5 list-inside list-disc space-y-1 text-muted">
        {reasons.slice(0, 5).map(([reason, count]) => (
          <li key={reason} className="break-words">
            {reason}
            {count > 1 && ` (${count})`}
          </li>
        ))}
        {reasons.length > 5 && <li>and {reasons.length - 5} more</li>}
      </ul>
    </div>
  );
}

function ArrowDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M5 20h14" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20V8m0 0 4.5 4.5M12 8l-4.5 4.5M5 4h14" />
    </svg>
  );
}
