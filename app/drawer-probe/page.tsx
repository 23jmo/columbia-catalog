import { notFound } from "next/navigation";

import { PrefetchLink } from "@/components/catalog/prefetch-link";

/**
 * TEMPORARY — a way to open the section drawer while `/search` is being worked
 * on elsewhere and never finishes loading its index.
 *
 * The drawer is an intercepted route, so it only opens on a client-side
 * navigation from a root-level page. With search down there is no such page,
 * which makes both the drawer and the dev motion dial unreachable. This is one.
 *
 * Delete this directory once search works again. Nothing imports it.
 *
 * The `notFound()` guard is not ceremony: this is a route, and a route that
 * exists is reachable by anyone who guesses the path. The check is evaluated
 * against a build-time constant, so in a production build this page is a 404
 * whether or not someone remembers to remove the file.
 */
export default function DrawerProbePage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const targets = [
    { href: "/course/COMS4118W?section=001", label: "COMS 4118 · section 001" },
    { href: "/course/COMS4118W?section=V01", label: "COMS 4118 · section V01" },
    { href: "/course/COMS4118W", label: "COMS 4118 · no section (chooser)" },
    { href: "/course/NOPE0000?section=001", label: "not a course (not-found state)" },
  ];

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-title-2-semibold text-text-primary">Drawer probe</h1>
        <p className="text-body-regular text-text-secondary">
          Temporary. Opens the section drawer so the motion dial at the bottom of the
          screen has something to tune. Delete this route once search loads again.
        </p>
      </div>

      <ul className="flex list-none flex-col gap-1">
        {targets.map((target) => (
          <li key={target.href}>
            <PrefetchLink
              href={target.href}
              className="inline-flex rounded-lg px-2 py-2 text-body-medium text-text-primary underline decoration-border-table underline-offset-4 transition-colors outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              {target.label}
            </PrefetchLink>
          </li>
        ))}
      </ul>
    </main>
  );
}
