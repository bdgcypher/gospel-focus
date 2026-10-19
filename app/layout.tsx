import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Nunito, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { AppChrome } from "@/components/app-chrome";
import { Providers } from "./providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const sourceSerif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"] });
// The playful skin's own face. Nunito carries italic too, because the passages
// it sets include the occasional italic word.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Gospel Focus",
  description:
    "Open to a random passage from the standard works and general conference — then read the whole chapter in the Gospel Library.",
  applicationName: "Gospel Focus",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Gospel Focus", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f2e7" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} ${nunito.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Tag the document with the Capacitor platform as early as
            possible (before React hydration) so safe-area CSS applies
            without a flash; providers.tsx sets it too as a fallback.

            The same script puts the chosen style on the document. The playful
            skin is a class the stylesheet hangs everything off, so it has to
            be there before the first frame or a playful reader would see the
            focused app for a moment on every launch. providers.tsx keeps the
            class right after hydration and across tabs.

            It also moves a theme stored by the earlier build — where playful
            was a theme of its own — onto the two choices that replaced it, so
            a reader who had picked it keeps the playful style.

            And it settles the motion preference before the first frame: the
            page entrances are animations in the stylesheet (see the "Changing
            pages" rules in globals.css), so a reader who has turned motion off
            has to have that on the document before the first page arrives.
            Unset preferences follow the device, as lib/preferences.ts does. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{
  var c=window.Capacitor;if(c&&c.getPlatform)document.documentElement.dataset.capacitor=c.getPlatform();
  var k="gospel-focus:preferences:v1";
  var t=localStorage.getItem("theme");
  if(t==="playful-light"||t==="playful-dark"){
    var p=JSON.parse(localStorage.getItem(k)||"{}");
    p.style="playful";
    localStorage.setItem(k,JSON.stringify(p));
    localStorage.setItem("theme",t==="playful-light"?"light":"dark");
  }
  var q=JSON.parse(localStorage.getItem(k)||"{}");
  if(q.style==="playful")document.documentElement.classList.add("playful");
  var reduce=typeof q.reduceMotion==="boolean"?q.reduceMotion:matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.dataset.reduceMotion=reduce?"true":"false";
}catch(e){}`,
          }}
        />
        <Providers>
          {/* The app bar, the footer and the menu, mounted once for the whole
              app: they must not be part of the page that changes, both so the
              page can animate and so the section indicator can travel between
              tabs (see components/app-chrome.tsx). */}
          <AppChrome>{children}</AppChrome>
        </Providers>
      </body>
    </html>
  );
}
