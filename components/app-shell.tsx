"use client";

import { useState, type ReactNode } from "react";
import { AppHeader } from "./app-header";
import { BottomNav } from "./nav-bar";
import { MenuPanel } from "./menu-panel";
import { ReminderSync } from "./reminder-sync";
import { StreakTracker } from "./streak-tracker";
import { StudyTracker } from "./study-tracker";
import { WidgetPrompt } from "./widget-prompt";

/**
 * The chrome every page shares: the app bar, the sections, the page itself, the
 * footer, and the menu pane that the header's button — or, on a phone, the
 * bottom bar's last entry — opens. Pages provide only their content.
 *
 * Both navigations are rendered and the stylesheet picks one (see globals.css),
 * so the bottom bar costs a phone nothing but the markup and costs a rotation
 * no re-render.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    // `app-shell-content` reserves the strip the bottom navigation sits in, so
    // the end of the page — footer included — never hides behind it.
    //
    // The shell grows with its content and never shrinks below it (`grow
    // shrink-0` on an automatic basis) rather than taking `flex-1`'s zero basis.
    // A zero basis and a definite body made this box exactly one viewport tall
    // however long the page was, and a box of that height can only put its own
    // bottom padding *inside* itself — so on every page long enough to scroll,
    // the reserved strip sat up beside the page's content instead of under the
    // footer, and the disclaimer's last line ended up behind the bottom bar.
    // Growing from the content, the box is the page plus the strip, and the
    // strip lands where the page ends, which is the only place it can do its
    // job. Short pages are unchanged: the shell still fills the viewport and
    // the footer still rides at the foot of the screen.
    <div className="app-shell-content flex min-h-full grow shrink-0 basis-auto flex-col">
      <AppHeader onOpenMenu={() => setMenuOpen(true)} />

      {children}

      {/* Left-aligned, like the page above it: a centred paragraph under a
          page whose every line starts at the margin read as a separate note
          rather than the small print of the same document. */}
      <footer className="border-t border-border/70 px-4 py-5 text-left text-xs text-muted sm:px-6">
        <p>
          Scripture text is public domain; passages link to the Church&apos;s Gospel Library. This app is not
          sponsored by or affiliated with The Church of Jesus Christ of Latter-day Saints.
        </p>
      </footer>

      {/* Keeps the daily reminder's rolling window topped up, from whichever
          screen the reader happens to be on. */}
      <ReminderSync />

      {/* Counts the minutes of a running study session, on whichever screen the
          reader happens to be on. Invisible by design — the hero's bar is the
          only thing that reports it. */}
      <StudyTracker />

      {/* And puts a day in the streak once those minutes have reached the day's
          goal. Also invisible: the number in the app bar is the only place it
          shows. */}
      <StreakTracker />

      {/* The widget's one invitation, offered where the goal lands rather than
          on the hub — see components/widget-prompt.tsx. Silent on every page
          until a session actually finishes a day's study. */}
      <WidgetPrompt />

      <MenuPanel open={menuOpen} onClose={() => setMenuOpen(false)} />
      <BottomNav onOpenMenu={() => setMenuOpen(true)} menuOpen={menuOpen} />
    </div>
  );
}
