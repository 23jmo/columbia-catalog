import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4 py-6 sm:px-6">
        <div>
          <p className="text-[11px] font-medium tracking-[0.22em] text-gold uppercase">
            Unofficial · public sources only
          </p>
          <Link href="/" className="mt-1 block font-display text-3xl tracking-tight text-navy-deep sm:text-4xl">
            Lion Catalog
          </Link>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">
            Browse Columbia sections from the Directory of Classes. No login, no registration.
          </p>
        </div>
        <p className="font-display text-right text-sm text-ink-soft">
          Fall 2026
          <span className="mt-1 block text-[11px] tracking-[0.16em] uppercase">
            Term 20263
          </span>
        </p>
      </div>
    </header>
  );
}
