import Link from "next/link";
import type { ReactNode } from "react";
import { Glyph } from "./glyph";
import type { Feature } from "@/lib/features";

/**
 * One feature, as a launch card.
 *
 * A card says what a page is for and how to get there in one glance, which is
 * the whole point of a hub: the reader picks a direction without having to know
 * the app. The "Soon" tag is the honest part — a card that leads to a
 * placeholder should say so before it is tapped, not after.
 *
 * Cards sit two to a row on every width, so this one is written for the narrow
 * column it usually lands in: the compact heading (`tileTitle`) and the shorter
 * line (`tileBlurb`) where the full ones are a mouthful, smaller type and
 * padding on a phone, roomier on a tablet. A card that says less is a card the
 * reader can take in at a glance — the page it leads to says the rest.
 */
export function FeatureCard({ feature, cta }: { feature: Feature; cta?: string }) {
  return (
    <Link
      href={feature.href}
      className="group flex flex-col rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-accent/60 sm:rounded-3xl sm:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/12 text-accent-strong sm:h-11 sm:w-11 sm:rounded-2xl">
          <Glyph name={feature.icon} className="h-5 w-5 sm:h-6 sm:w-6" />
        </span>
        {feature.status === "planned" && (
          <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted sm:px-2.5 sm:py-1 sm:text-[10px]">
            Soon
          </span>
        )}
      </div>

      <p className="mt-3 font-serif text-[15px] font-semibold leading-snug text-foreground transition-colors group-hover:text-accent-strong sm:mt-4 sm:text-lg">
        {feature.tileTitle ?? feature.title}
      </p>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-muted sm:text-sm">
        {feature.tileBlurb ?? feature.blurb}
      </p>

      <span className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent-strong sm:mt-4 sm:text-xs">
        {cta ?? (feature.status === "planned" ? "See the plan" : "Open")}
        <Glyph name="arrow" className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      </span>
    </Link>
  );
}

/**
 * The two-column wall the cards sit in.
 *
 * Two at every width, because the compact card is short enough for a phone's
 * half-width column and the hubs read better as a short list of pairs than as
 * one long ladder. Pass `features` for an ordinary group, or children when a
 * hub wants to say something between the cards.
 */
export function FeatureGrid({ features = [], children }: { features?: Feature[]; children?: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {features.map((feature) => (
        <FeatureCard key={feature.id} feature={feature} />
      ))}
      {children}
    </div>
  );
}
