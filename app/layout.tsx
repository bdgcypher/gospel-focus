import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const sourceSerif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"] });

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
    { media: "(prefers-color-scheme: dark)", color: "#13100b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Tag the document with the Capacitor platform as early as
            possible (before React hydration) so safe-area CSS applies
            without a flash; providers.tsx sets it too as a fallback. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var c=window.Capacitor;if(c&&c.getPlatform)document.documentElement.dataset.capacitor=c.getPlatform()}catch(e){}',
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
