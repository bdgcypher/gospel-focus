"use client";

import { useEffect, useState } from "react";
import { Glyph } from "./glyph";

/**
 * The kebab at the end of a list row, and the short menu it opens.
 *
 * A row of a list is the way into the thing it names; everything else that can
 * be done to it belongs behind one control rather than beside it, so the row
 * stays one line and the verbs stay out of the reading. The same control serves
 * every row that has one — the bookmarks, the chain of links on a mark, the
 * links read beside the words — so the press is learned once.
 *
 * The menu dims nothing. A press anywhere else is how it is put away, which a
 * full-screen button behind it catches; Escape does the same, and takes the key
 * in the capture phase so the sheet the row sits in stays open while only the
 * menu closes.
 */
export function RowMenu({
  label,
  actions,
  className = "",
}: {
  /** What the menu is for — "Options for Alma 32:21"; also the kebab's name. */
  label: string;
  actions: { label: string; onSelect: () => void }[];
  /** Extra classes for the kebab, for a row that wants a different corner. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground ${className}`}
      >
        <Glyph name="more" className="h-5 w-5" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close the options"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="menu"
            aria-label={label}
            className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-2xl border border-border bg-background py-1.5 shadow-2xl"
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  action.onSelect();
                }}
                className="block w-full px-4 py-2.5 text-left text-[15px] text-foreground transition-colors hover:bg-surface-2"
              >
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
