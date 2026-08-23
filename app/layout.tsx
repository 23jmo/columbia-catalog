import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/styles/globals.css";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background-full text-text-primary">
        {children}
        {drawer}
      </body>
    </html>
  );
}
