import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function NotFound() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="font-display text-3xl text-navy-deep">Section not found</p>
        <p className="mt-3 text-sm text-ink-soft">
          That listing is not in the public Fall 2026 directory page we fetched.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-gold">
          Back to COMS catalog
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
