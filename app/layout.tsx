import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Columbia Catalog",
  description:
    "Fast, honest course search and schedule planning for Columbia and Barnard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background-full text-text-primary">
        {children}
      </body>
    </html>
  );
}
