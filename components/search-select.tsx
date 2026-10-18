"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Glyph } from "./glyph";

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  /** The dropdown's own label, above the control. */
  label: string;
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** The answer was wrong in the last guess: the control says so. */
  invalid?: boolean;
  /**
   * The part was given away by a hint. It still shows its value, but reads as
   * settled — the reader is not being asked to choose it any more.
   */
  revealed?: boolean;
  /** Spoken and shown under the control when there is something to say. */
  hint?: string;
}

/**
 * A dropdown that can be searched.
 *
 * A native `<select>` is a plain list once a book list runs to sixty entries,
 * and a `<datalist>` is a typing game on some phones. This is a button that
 * opens a filter box over the options, so a reader can either scroll a short
 * list or type two letters of a long one, and a keyboard can do it without
 * leaving the control: arrows move, Enter chooses, Escape closes.
 */
export function SearchSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Choose…",
  disabled = false,
  invalid = false,
  revealed = false,
  hint,
}: Props) {
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const filter = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const chosen = options.find((option) => option.value === value) ?? null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? options.filter((option) => option.label.toLowerCase().includes(needle))
      : options;
  }, [options, query]);

  // Opening focuses the filter; the cursor starts on the current choice, which
  // is worked out where the list is opened rather than in an effect.
  useEffect(() => {
    if (open) filter.current?.focus();
  }, [open]);

  // Options can arrive while the list is open (a book's chapters, for one), so
  // the cursor is clamped to the list rather than assumed to be in it.
  const activeIndex = Math.min(active, Math.max(0, filtered.length - 1));

  const openList = () => {
    const index = options.findIndex((option) => option.value === value);
    setActive(index >= 0 ? index : 0);
    setQuery("");
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) button.current?.focus();
  };

  const choose = (option: SelectOption) => {
    onChange(option.value);
    close();
  };

  const onFilterKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[activeIndex];
      if (option) choose(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <div ref={wrapper} className="relative">
      <span
        id={`${id}-label`}
        className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted"
      >
        {label}
        {revealed && (
          <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-accent-strong">
            revealed
          </span>
        )}
      </span>

      <button
        ref={button}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${id}-label`}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!open) openList();
          }
        }}
        className={`flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-surface px-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          invalid
            ? "border-wrong text-wrong"
            : revealed
              ? "border-accent/50 text-foreground"
              : "border-border text-foreground hover:border-accent/50"
        }`}
      >
        <span className={`truncate ${chosen ? "" : "text-muted"}`}>
          {chosen ? chosen.label : placeholder}
        </span>
        <Glyph
          name="arrow"
          className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${open ? "-rotate-90" : "rotate-90"}`}
        />
      </button>

      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 rounded-xl border border-border bg-surface p-2 shadow-2xl">
          <input
            ref={filter}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onFilterKey}
            placeholder={`Search ${label.toLowerCase()}`}
            aria-label={`Search ${label.toLowerCase()}`}
            aria-controls={`${id}-list`}
            aria-activedescendant={
              filtered[activeIndex] ? `${id}-option-${filtered[activeIndex].value}` : undefined
            }
            className="h-9 w-full rounded-lg border border-border bg-surface-2 px-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent"
          />
          <ul id={`${id}-list`} role="listbox" className="mt-1.5 max-h-56 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-2 py-2 text-sm text-muted">Nothing matches.</li>
            )}
            {filtered.map((option, index) => (
              <li key={option.value}>
                <button
                  type="button"
                  id={`${id}-option-${option.value}`}
                  role="option"
                  aria-selected={option.value === value}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                    index === activeIndex ? "bg-surface-2 text-foreground" : "text-foreground/85"
                  } ${option.value === value ? "font-semibold text-accent-strong" : ""}`}
                >
                  {option.label}
                  {option.value === value && <Glyph name="check" className="h-3.5 w-3.5" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
