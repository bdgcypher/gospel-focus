"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "./app-shell";
import { BackLink, useGoBack } from "./back-link";
import { Glyph, type GlyphName } from "./glyph";
import { featureById, type FeatureStatus } from "@/lib/features";

interface Props {
  /**
   * The catalog entry this page is: its title, blurb, icon, and capabilities
   * all come from lib/features.ts, so a page can't describe itself differently
   * from the card that led here. Omit it for a section hub, which is a group of
   * features rather than one of them.
   */
  featureId?: string;
  title?: string;
  /**
   * The line under the heading. A string is the usual case — the catalog's own
   * blurb, or `""` to say nothing — while a node is for a page whose strapline
   * needs its own shape, such as the reference quiz's verse and citation.
   */
  subtitle?: ReactNode;
  icon?: GlyphName;
  /**
   * "ready" pages show only their content; "planned" ones also get the
   * placeholder block. Defaults to whatever the catalog says — which is the
   * safer thing to forget, since a page claiming more than it does is worse
   * than one admitting it is early.
   */
  status?: FeatureStatus;
  /**
   * Spacing for the block holding `children`. The frame's 32px suits a page
   * that opens on a card; a page that opens on one quiet line of its own reads
   * better closer to the heading, so it can pass a tighter margin here rather
   * than nudging its first element up with a negative one.
   */
  contentClassName?: string;
  children?: ReactNode;
}

/**
 * The frame every section and feature page sits in: the app chrome, a heading,
 * the page's own content, and — while the feature is still to come — an honest
 * block saying so. A placeholder that lists what the feature will do is a plan
 * rather than a dead end.
 */
export function FeaturePage({
  featureId,
  title,
  subtitle,
  icon,
  status,
  contentClassName,
  children,
}: Props) {
  const feature = featureId ? featureById(featureId) : undefined;
  const heading = title ?? feature?.title ?? "Gospel Focus";
  const blurb = subtitle ?? feature?.blurb ?? "";
  const glyph = icon ?? feature?.icon ?? "book";
  const resolved = status ?? feature?.status ?? "planned";
  const capabilities = feature?.capabilities ?? [];
  // The placeholder's own way out goes back for the same reason the arrow does:
  // a planned page reached from the hub returns to the hub, not the front door.
  const goBack = useGoBack();

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:max-w-5xl sm:px-6 sm:py-10">
        {/* No top margin of its own: the page's padding already holds the
            heading clear of the app bar, and stacking another 24px on it read
            as an empty band under the header on every page built from this
            frame. The row starts where the padding ends.

            Centred rather than top-aligned: the icon tile, the title and the
            back control sit on one midline. A page with no blurb has a title
            shorter than the tile, and hanging it from the tile's top left it
            looking adrift from the page's content. */}
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-surface text-accent-strong">
            <Glyph name={glyph} className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">{heading}</h2>
          </div>
          <BackLink />
        </div>

        {/* The subtitle on its own line under the heading row, as on the reader:
            one place for a page's strapline across the whole app. */}
        {blurb && <p className="mt-2 text-sm text-muted">{blurb}</p>}

        {children && <div className={contentClassName ?? "mt-8"}>{children}</div>}

        {resolved === "planned" && (
          <section className="mt-8 rounded-3xl border border-dashed border-border bg-surface/70 p-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-strong">
              <Glyph name="clock" className="h-3.5 w-3.5" />
              Not built yet
            </span>

            <p className="mt-4 text-sm text-muted">
              This page is a placeholder — nothing here is wired up yet. Below is the shape the feature
              will take.
            </p>

            {capabilities.length > 0 && (
              <ul className="mt-5 space-y-2.5">
                {capabilities.map((capability) => (
                  <li key={capability} className="flex gap-3 text-sm leading-relaxed text-foreground/85">
                    <span className="mt-0.5 shrink-0 text-accent-strong">
                      <Glyph name="check" className="h-4 w-4" />
                    </span>
                    {capability}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link
                href="/read"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90"
              >
                Open a passage
              </Link>
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
              >
                Back
              </button>
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
