import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Agentation } from "agentation";
import "@/styles/globals.css";

/** BoardUI's sans stack — exposed as `--font-inter` for `styles/theme.css`. */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/** Code blocks — exposed as `--font-mono-source` for `styles/theme.css`. */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-source",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Columbia Catalog",
  description:
    "Fast, honest course search and schedule planning for Columbia and Barnard.",
};

/**
 * `drawer` is a parallel-route slot. Course detail is a real URL
 * (`/course/[courseId]`) that renders as an overlay when navigated to from
 * inside the app, and as a full page on a cold hit — see
 * `app/@drawer/(.)course/[courseId]/page.tsx`. The slot lives at the root so
 * the drawer can be opened from any surface, not just search.
 *
 * `app/@drawer/default.tsx` renders null, so the slot costs nothing until a
 * course is actually open.
 */
export default function RootLayout({
  children,
  drawer,
}: {
  children: ReactNode;
  drawer: ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-dvh antialiased`}
    >
      <body className="flex min-h-dvh flex-col bg-background-full font-sans text-text-primary">
        {children}
        {drawer}
        {/*
          Annotation toolbar. Dev only — the `NODE_ENV` guard is evaluated at
          build time, so the component and its tree are dropped from the
          production bundle entirely rather than shipped and hidden.

          `agentation` stays a regular dependency rather than a devDependency:
          the import above has to resolve during `next build`, and a production
          install (`npm ci --omit=dev`) would not have it.
        */}
        {process.env.NODE_ENV === "development" && <Agentation />}
      </body>
    </html>
  );
}
