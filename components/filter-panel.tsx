"use client";

import { useMemo, useState } from "react";
import { bookKey, eligibleConferences, eligibleVolumeVerseCount } from "@/lib/picker";
import { PRESETS, matchPreset, presetFilters } from "@/lib/presets";
import type { Filters, Manifest } from "@/lib/types";

interface Props {
  manifest: Manifest;
  filters: Filters;
  onChange: (next: Filters) => void;
  /**
   * Set when the panel stands on its own (the wide-screen sidebar), so it
   * carries its own control for packing itself away again.
   */
  onCollapse?: () => void;
}

const isOn = (map: Record<string, boolean>, key: string) => map[key] !== false;

const numberFmt = new Intl.NumberFormat("en-US");

/** Ordering hint for the scripture list: Bible first, then the other works. */
const BIBLE_VOLUMES = ["ot", "nt"];

export function FilterPanel({ manifest, filters, onChange, onCollapse }: Props) {
  const [openVolume, setOpenVolume] = useState<string | null>(null);
  const [openConference, setOpenConference] = useState(false);

  const byId = new Map(manifest.volumes.map((v) => [v.id, v] as const));
  const pick = (ids: string[]) => ids.flatMap((id) => { const v = byId.get(id); return v ? [v] : []; });
  // Bible volumes first, then every remaining work.
  const orderedVolumes = [
    ...pick(BIBLE_VOLUMES),
    ...manifest.volumes.filter((v) => !BIBLE_VOLUMES.includes(v.id)),
  ];

  const toggleVolume = (id: string) => {
    const on = isOn(filters.volumes, id);
    onChange({ ...filters, volumes: { ...filters.volumes, [id]: !on } });
  };

  const toggleBook = (volumeId: string, slug: string) => {
    const key = bookKey(volumeId, slug);
    const on = isOn(filters.books, key);
    onChange({ ...filters, books: { ...filters.books, [key]: !on } });
  };

  const setAllBooks = (volumeId: string, slugs: string[], value: boolean) => {
    const next = { ...filters.books };
    for (const s of slugs) next[bookKey(volumeId, s)] = value;
    onChange({ ...filters, books: next });
  };

  const toggleConference = (id: string) => {
    const on = isOn(filters.conferences, id);
    onChange({ ...filters, conferences: { ...filters.conferences, [id]: !on } });
  };

  const conferenceMasterOn = filters.conferenceMaster !== false;
  const toggleConferenceMaster = () => {
    if (conferenceMasterOn) {
      onChange({ ...filters, conferenceMaster: false });
    } else {
      // Checking the master box selects every conference again by default.
      onChange({ ...filters, conferenceMaster: true, conferences: {} });
    }
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => onChange(presetFilters(preset, manifest));

  // The preset the current selection matches, so it can stay highlighted.
  const activePreset = useMemo(() => matchPreset(manifest, filters), [manifest, filters]);

  const conferencePassages = eligibleConferences(manifest, filters).reduce(
    (a, c) => a + c.paragraphs,
    0
  );
  const enabledConferences = eligibleConferences(manifest, filters).length;

  return (
    <section className="rounded-3xl border border-border bg-surface/80 p-5 backdrop-blur sm:p-6">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-lg font-semibold text-foreground">
            What sources to include?
          </h2>
          <p className="text-sm text-muted">Select resources to draw inspiration from.</p>
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Hide filters"
            className="-mr-1 -mt-0.5 shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            {/* A panel with an arrow back into it: the sidebar packing itself away. */}
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18M16 15l-3-3 3-3" />
            </svg>
          </button>
        )}
      </div>

      {/* Presets */}
      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Presets</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              aria-pressed={activePreset === preset.id}
              className={`rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
                activePreset === preset.id
                  ? "border-accent bg-accent text-accent-contrast"
                  : "border-border bg-surface-2 text-muted hover:border-accent/60 hover:text-accent-strong"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scriptures */}
      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Scriptures
        </h3>
        <ul className="mt-3 space-y-2">
          {orderedVolumes.map((volume) => (
            <VolumeRow
              key={volume.id}
              volume={volume}
              filters={filters}
              expanded={openVolume === volume.id}
              onToggleVolume={() => toggleVolume(volume.id)}
              onToggleRow={() => setOpenVolume(openVolume === volume.id ? null : volume.id)}
              onToggleBook={(slug) => toggleBook(volume.id, slug)}
              onSetAllBooks={(value) =>
                setAllBooks(volume.id, volume.books.map((b) => b.slug), value)
              }
            />
          ))}
        </ul>
      </div>

      {/* General conference */}
      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          General conference
        </h3>
        <div className="mt-3 rounded-2xl border border-border bg-surface/60">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Check
              checked={conferenceMasterOn}
              onChange={toggleConferenceMaster}
              label="General Conference"
            />
            <button
              type="button"
              onClick={toggleConferenceMaster}
              className="flex-1 text-left"
            >
              <span className="block text-sm font-medium text-foreground">General Conference</span>
              <span className="block text-xs text-muted">
                {numberFmt.format(conferencePassages)} passages · {enabledConferences}/
                {manifest.conferences.length} conferences
              </span>
            </button>
            {conferenceMasterOn && (
              <Chevron
                expanded={openConference}
                onClick={() => setOpenConference((v) => !v)}
                label="Toggle conferences"
              />
            )}
          </div>

          {openConference && conferenceMasterOn && (
            <div className="border-t border-border px-3 py-3">
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, conferences: {} })}
                  className="text-xs font-medium text-accent-strong hover:underline"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...filters,
                      conferences: Object.fromEntries(manifest.conferences.map((c) => [c.id, false])),
                    })
                  }
                  className="text-xs font-medium text-muted hover:underline"
                >
                  Clear
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {manifest.conferences.map((c) => {
                  const on = isOn(filters.conferences, c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleConference(c.id)}
                      aria-pressed={on}
                      className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                        on
                          ? "border-accent/50 bg-accent/15 text-accent-strong"
                          : "border-border bg-surface-2 text-muted hover:text-foreground"
                      }`}
                    >
                      <span className="block font-medium">{c.label}</span>
                      <span className="block opacity-70">{c.talks} talks</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function VolumeRow({
  volume,
  filters,
  expanded,
  onToggleVolume,
  onToggleRow,
  onToggleBook,
  onSetAllBooks,
}: {
  volume: Manifest["volumes"][number];
  filters: Filters;
  expanded: boolean;
  onToggleVolume: () => void;
  onToggleRow: () => void;
  onToggleBook: (slug: string) => void;
  onSetAllBooks: (value: boolean) => void;
}) {
  const on = isOn(filters.volumes, volume.id);
  const enabledBooks = volume.books.filter((b) => isOn(filters.books, bookKey(volume.id, b.slug)));
  const eligibleVerses = eligibleVolumeVerseCount(volume, filters);

  return (
    <li className="rounded-2xl border border-border bg-surface/60">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Check checked={on} onChange={onToggleVolume} label={volume.title} />
        <button type="button" onClick={onToggleVolume} className="flex-1 text-left">
          <span className="block text-sm font-medium text-foreground">{volume.title}</span>
          <span className="block text-xs text-muted">
            {numberFmt.format(eligibleVerses)} passages · {enabledBooks.length}/{volume.books.length}{" "}
            books
          </span>
        </button>
        <Chevron expanded={expanded} onClick={onToggleRow} label={`Toggle books of ${volume.title}`} />
      </div>

      {expanded && (
        <div className="border-t border-border px-3 py-3">
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => onSetAllBooks(true)}
              className="text-xs font-medium text-accent-strong hover:underline"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => onSetAllBooks(false)}
              className="text-xs font-medium text-muted hover:underline"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {volume.books.map((book) => {
              const bookOn = on && isOn(filters.books, bookKey(volume.id, book.slug));
              return (
                <button
                  key={book.slug}
                  type="button"
                  onClick={() => onToggleBook(book.slug)}
                  title={`${numberFmt.format(book.verses)} passages`}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    bookOn
                      ? "border-accent/50 bg-accent/15 text-accent-strong"
                      : "border-border bg-surface-2 text-muted hover:text-foreground"
                  }`}
                >
                  {book.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </li>
  );
}

function Chevron({
  expanded,
  onClick,
  label,
}: {
  expanded: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={label}
      className="rounded-full p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors ${
        checked ? "border-accent bg-accent text-accent-contrast" : "border-border bg-surface-2 text-transparent"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 13 4 4L19 7" />
      </svg>
    </button>
  );
}
