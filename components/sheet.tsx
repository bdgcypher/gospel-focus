"use client";

import { useEffect, type ReactNode } from "react";
import { Glyph } from "./glyph";

/**
 * The app's bottom sheet: a panel that comes up over the page on a phone and
 * centres itself on a wide screen.
 *
 * It is deliberately small — a heading, a close control, and whatever the caller
 * puts inside — because every sheet in the app is a list of choices rather than
 * a form: the chapter grid, the browse index, a verse's actions, the marks in a
 * chapter. Escape closes it, the dimmed page behind it closes it, and the close
 * control is the third way out, which is what a sheet that covers the page owes
 * a reader whose thumb is already moving.
 *
 * It is not a dialog in the app's other sense (components/note-dialog.tsx and
 * friends) and it does not trap focus: its contents are links and buttons that a
 * scroll reaches, and the sheet itself scrolls when the list is longer than the
 * screen. A sheet with a text field in it should use the dialog pattern instead.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-black/45" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-background p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <Glyph name="close" className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
