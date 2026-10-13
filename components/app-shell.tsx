"use client";

import { useState, type ReactNode } from "react";
import { AppHeader } from "./app-header";
import { MenuPanel } from "./menu-panel";

/**
 * The chrome every page shares: the app bar, the page itself, the footer, and
 * the menu pane the bar's button opens. Pages provide only their content.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader onOpenMenu={() => setMenuOpen(true)} />

      {children}

      <footer className="border-t border-border/70 px-4 py-5 text-center text-xs text-muted sm:px-6">
        <p>
          Scripture text is public domain; passages link to the Church&apos;s Gospel Library. This app is not
          sponsored by or affiliated with The Church of Jesus Christ of Latter-day Saints.
        </p>
      </footer>

      <MenuPanel open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
