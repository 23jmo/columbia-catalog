import { DIRECTORY_ORIGIN } from "@/lib/constants";

export function SiteFooter({ fetchedAt }: { fetchedAt?: string }) {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs leading-relaxed text-ink-soft sm:px-6">
        <p>
          Built from the public{" "}
          <a className="underline decoration-gold/60 underline-offset-2" href={DIRECTORY_ORIGIN}>
            Directory of Classes
          </a>{" "}
          and, when available,{" "}
          <a
            className="underline decoration-gold/60 underline-offset-2"
            href="https://bulletin.columbia.edu"
          >
            bulletin.columbia.edu
          </a>
          . Not affiliated with Columbia University. Meeting times are omitted when the bulletin page is unavailable.
        </p>
        <p>
          This app never asks for a UNI, CAS password, Duo code, or OAuth token. It cannot register, drop, swap, or waitlist.
          {fetchedAt ? ` Last fetch ${fetchedAt}.` : ""}
        </p>
      </div>
    </footer>
  );
}
