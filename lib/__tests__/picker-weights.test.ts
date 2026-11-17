import { describe, expect, it } from "vitest";
import { sourceWeights } from "../picker";
import type { Filters, Manifest } from "../types";

const ON = { volumes: {}, books: {}, conferences: {}, conferenceMaster: true } as unknown as Filters;

/** A library of a chosen size: one book of `verses`, and `paragraphs` of talk. */
const library = (verses: number, paragraphs: number) =>
  ({
    volumes: [
      {
        id: "ot",
        title: "Old Testament",
        books: [{ slug: "gen", verses }],
      },
    ],
    conferences: paragraphs > 0 ? [{ id: "1971-04", label: "April 1971", paragraphs }] : [],
  }) as unknown as Manifest;

const share = (weights: { scriptureWeight: number; conferenceWeight: number }) =>
  weights.conferenceWeight / (weights.scriptureWeight + weights.conferenceWeight);

describe("sourceWeights", () => {
  it("holds conference at the share it had before the older sessions", () => {
    // The bundled library is 41,995 verses against 117,504 paragraphs; the
    // raw counts would give conference nearly three draws in four.
    expect(share(sourceWeights(library(41_995, 117_504), ON))).toBeCloseTo(0.413, 3);
  });

  it("leaves a talk-heavy library uncapped in proportion to the verses", () => {
    const weights = sourceWeights(library(1_000, 10_000), ON);
    expect(weights.scriptureWeight).toBe(1_000);
    expect(weights.conferenceWeight).toBeCloseTo(703.8, 1);
  });

  it("does not invent talk that isn't there", () => {
    const weights = sourceWeights(library(10_000, 2), ON);
    expect(weights.conferenceWeight).toBe(2);
  });

  it("caps against the verses that are switched on, not the whole volume", () => {
    const half = { ...ON, volumes: { ot: false } } as unknown as Filters;
    const all = sourceWeights(library(1_000, 10_000), ON);
    const none = sourceWeights(library(1_000, 10_000), half);
    expect(none.scriptureWeight).toBe(0);
    // With no verses to weigh against, the talks stand on their own count.
    expect(none.conferenceWeight).toBe(10_000);
    expect(share(all)).toBeCloseTo(0.413, 3);
  });
});
