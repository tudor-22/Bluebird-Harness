import type { Metadata } from "next";
import type { Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bluebird",
  description: "A private AI assistant that runs on your own computer.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: "#12829e",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en-GB"
      className={`${newsreader.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var m=localStorage.getItem('bluebird-theme-mode')||'auto';" +
              "var d=m==='dark'||(m==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);" +
              "document.documentElement.dataset.theme=d?'dark':'light';" +
              "document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();",
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
