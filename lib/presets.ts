import { bookKey } from "./picker";
import type { Filters, Manifest } from "./types";

export type PresetId = "all" | "bible" | "standard-works" | "conference";

/** Old & New Testament make up the "Bible" preset. */
const BIBLE_VOLUMES = ["ot", "nt"];

export const PRESETS: {
  id: PresetId;
  label: string;
  volumes: "all" | "bible" | "lds" | "none";
}[] = [
  { id: "all", label: "All", volumes: "all" },
  { id: "bible", label: "Bible", volumes: "bible" },
  { id: "standard-works", label: "LDS Standard Works", volumes: "lds" },
  { id: "conference", label: "LDS General Conference", volumes: "none" },
];

const isOn = (map: Record<string, boolean>, key: string) => map[key] !== false;

/** The volume switches and conference master state a preset should produce. */
export function presetConfig(preset: (typeof PRESETS)[number], manifest: Manifest) {
  const volumes: Record<string, boolean> = {};
  for (const v of manifest.volumes) {
    const inBible = BIBLE_VOLUMES.includes(v.id);
    // "LDS Standard Works" covers every volume of scripture, Bible included —
    // it differs from "All" only by leaving general conference out.
    volumes[v.id] =
      preset.volumes === "all" || preset.volumes === "lds" || (preset.volumes === "bible" && inBible);
  }
  return { volumes, conferenceMaster: preset.id === "all" || preset.id === "conference" };
}

/** A complete Filters object for a preset, with every book/conference enabled. */
export function presetFilters(preset: (typeof PRESETS)[number], manifest: Manifest): Filters {
  const { volumes, conferenceMaster } = presetConfig(preset, manifest);
  const books: Record<string, boolean> = {};
  for (const v of manifest.volumes) {
    for (const b of v.books) books[bookKey(v.id, b.slug)] = true;
  }
  return { volumes, books, conferences: {}, conferenceMaster };
}

/**
 * The preset the current selection exactly matches, or null when the user has
 * customized the filters. Powers the persistent preset highlight.
 */
export function matchPreset(manifest: Manifest, filters: Filters): PresetId | null {
  for (const preset of PRESETS) {
    const cfg = presetConfig(preset, manifest);
    let match = true;
    for (const v of manifest.volumes) {
      if (isOn(filters.volumes, v.id) !== (cfg.volumes[v.id] ?? false)) {
        match = false;
        break;
      }
      for (const b of v.books) {
        if (!isOn(filters.books, bookKey(v.id, b.slug))) {
          match = false;
          break;
        }
      }
      if (!match) break;
    }
    if (!match) continue;
    if ((filters.conferenceMaster !== false) !== cfg.conferenceMaster) continue;
    if (cfg.conferenceMaster && manifest.conferences.some((c) => !isOn(filters.conferences, c.id))) {
      continue;
    }
    return preset.id;
  }
  return null;
}
